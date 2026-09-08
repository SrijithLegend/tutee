import db from "./db";
import { now } from "./clock";
import { getContent } from "./content";
import { getRetrievability, gradeAnswer, Rating } from "./memory";
import type { Concept } from "@/types/content";

export type ConceptState = "locked" | "learn" | "practice" | "mastered";

export interface PlanetInfo {
  id: string;
  name: string;
  /** Total times the user has ever triggered this misconception (0 = never encountered). */
  hits: number;
}

export interface GraphNode {
  id: string;
  name: string;
  state: ConceptState;
  retrievability: number;
  mastery: number;
  injected: boolean;
  /** This concept's misconceptions, rendered as orbiting planets. */
  planets: PlanetInfo[];
}

export interface GraphEdge {
  source: string;
  target: string;
  unlocked: boolean;
}

export interface UserGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Mastery required on a prerequisite before its dependent concept unlocks. */
export const MASTERY_UNLOCK_THRESHOLD = 0.7;

interface ProgressRow {
  concept_id: string;
  learned: number;
  mastery: number;
}

const getProgressStmt = db.prepare(
  "SELECT concept_id, learned, mastery FROM concept_progress WHERE user_id = ?"
);

const getInjectedStmt = db.prepare(
  "SELECT concept_id, triggered_by FROM injected_nodes WHERE user_id = ?"
);

const misconceptionHitsStmt = db.prepare(
  "SELECT COUNT(*) as n FROM attempts WHERE user_id = ? AND misconception_id = ?"
);

const isInjectedStmt = db.prepare(
  "SELECT 1 FROM injected_nodes WHERE user_id = ? AND concept_id = ?"
);

const insertInjectedStmt = db.prepare(
  "INSERT INTO injected_nodes (user_id, concept_id, triggered_by, created_at) VALUES (?, ?, ?, ?)"
);

/** Injects a misconception's remedial concept into the user's graph. No-op if already injected or the misconception has no remedy. */
export function injectRemedialNode(userId: string, misconceptionId: string): boolean {
  const misconception = getContent().misconceptions.find((m) => m.id === misconceptionId);
  if (!misconception?.remedialConceptId) return false;

  if (isInjectedStmt.get(userId, misconception.remedialConceptId)) return false;

  insertInjectedStmt.run(userId, misconception.remedialConceptId, misconceptionId, now(userId).toISOString());
  gradeAnswer(userId, misconception.remedialConceptId, Rating.Good); // baseline FSRS card so it renders with a visible glow
  return true;
}

const getProgressRowStmt = db.prepare(
  "SELECT learned, mastery FROM concept_progress WHERE user_id = ? AND concept_id = ?"
);

const upsertLearnedStmt = db.prepare(`
  INSERT INTO concept_progress (user_id, concept_id, learned, mastery) VALUES (?, ?, 1, ?)
  ON CONFLICT(user_id, concept_id) DO UPDATE SET learned = 1
`);

/** Marks a concept's micro-lesson as seen. Idempotent; leaves mastery untouched if already tracked. */
export function markLearned(userId: string, conceptId: string): void {
  const existing = getProgressRowStmt.get(userId, conceptId) as { mastery: number } | undefined;
  upsertLearnedStmt.run(userId, conceptId, existing?.mastery ?? 0);
}

/** Current mastery and live retrievability for one concept, e.g. for explaining why a challenge was served. */
export function getConceptStatus(userId: string, conceptId: string): { mastery: number; retrievability: number } {
  const row = getProgressRowStmt.get(userId, conceptId) as { mastery: number } | undefined;
  return { mastery: row?.mastery ?? 0, retrievability: getRetrievability(userId, conceptId) };
}

/** Assembles the graph a user actually sees: base concepts plus any remedial nodes injected for them. */
export function getUserGraph(userId: string): UserGraph {
  const content = getContent();

  const progress = new Map<string, { learned: boolean; mastery: number }>();
  for (const row of getProgressStmt.all(userId) as unknown as ProgressRow[]) {
    progress.set(row.concept_id, { learned: row.learned === 1, mastery: row.mastery });
  }

  const injectedRows = getInjectedStmt.all(userId) as { concept_id: string; triggered_by: string }[];
  const injectedIds = new Set(injectedRows.map((r) => r.concept_id));

  // The remedial node sits between the failing concept and its prerequisite(s): failingConceptId -> remedialConceptId.
  const remedialForFailingConcept = new Map<string, string>();
  for (const row of injectedRows) {
    const misconception = content.misconceptions.find((m) => m.id === row.triggered_by);
    if (misconception) remedialForFailingConcept.set(misconception.conceptId, row.concept_id);
  }

  const visibleConcepts = content.concepts.filter(
    (c) => !c.remedialOnly || injectedIds.has(c.id)
  );
  const visibleIds = new Set(visibleConcepts.map((c) => c.id));

  const masteryOf = (id: string) => progress.get(id)?.mastery ?? 0;

  function isUnlocked(c: Concept): boolean {
    return c.prerequisites.every((p) => masteryOf(p) >= MASTERY_UNLOCK_THRESHOLD);
  }

  function stateOf(c: Concept): ConceptState {
    if (!isUnlocked(c)) return "locked";
    const p = progress.get(c.id);
    if (!p?.learned) return "learn";
    if (p.mastery < MASTERY_UNLOCK_THRESHOLD) return "practice";
    return "mastered";
  }

  const nodes: GraphNode[] = visibleConcepts.map((c) => ({
    id: c.id,
    name: c.name,
    state: stateOf(c),
    retrievability: getRetrievability(userId, c.id),
    mastery: masteryOf(c.id),
    injected: injectedIds.has(c.id),
    planets: content.misconceptions
      .filter((m) => m.conceptId === c.id)
      .map((m) => ({
        id: m.id,
        name: m.name,
        hits: (misconceptionHitsStmt.get(userId, m.id) as { n: number }).n,
      })),
  }));

  const edges: GraphEdge[] = [];
  for (const c of visibleConcepts) {
    const remedialId = remedialForFailingConcept.get(c.id);
    const routeThroughRemedial = remedialId && visibleIds.has(remedialId);

    for (const prereqId of c.prerequisites) {
      if (!visibleIds.has(prereqId)) continue;
      edges.push({
        source: prereqId,
        target: routeThroughRemedial ? remedialId : c.id,
        unlocked: isUnlocked(c),
      });
    }
    if (routeThroughRemedial) {
      edges.push({ source: remedialId, target: c.id, unlocked: isUnlocked(c) });
    }
  }

  return { nodes, edges };
}
