import db from "./db";
import { getContent } from "./content";
import { getRetrievability } from "./memory";
import type { Concept } from "@/types/content";

export type ConceptState = "locked" | "learn" | "practice" | "mastered";

export interface GraphNode {
  id: string;
  name: string;
  state: ConceptState;
  retrievability: number;
  mastery: number;
  injected: boolean;
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
  "SELECT concept_id FROM injected_nodes WHERE user_id = ?"
);

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

/** Assembles the graph a user actually sees: base concepts plus any remedial nodes injected for them. */
export function getUserGraph(userId: string): UserGraph {
  const content = getContent();

  const progress = new Map<string, { learned: boolean; mastery: number }>();
  for (const row of getProgressStmt.all(userId) as unknown as ProgressRow[]) {
    progress.set(row.concept_id, { learned: row.learned === 1, mastery: row.mastery });
  }

  const injectedIds = new Set(
    (getInjectedStmt.all(userId) as { concept_id: string }[]).map((r) => r.concept_id)
  );

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
  }));

  const edges: GraphEdge[] = [];
  for (const c of visibleConcepts) {
    for (const prereqId of c.prerequisites) {
      if (!visibleIds.has(prereqId)) continue;
      edges.push({ source: prereqId, target: c.id, unlocked: isUnlocked(c) });
    }
  }

  return { nodes, edges };
}
