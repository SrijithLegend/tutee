import crypto from "node:crypto";
import db from "./db";
import { getContent } from "./content";
import type { Concept } from "@/types/content";
import type { PdfAnalysis } from "./pdfAnalysis";

interface UploadedConceptRow {
  id: string;
  user_id: string;
  name: string;
  explanation: string;
  worked_problem: string;
  worked_steps: string;
  key_terms: string;
  source_filename: string;
  created_at: string;
}

function rowToConcept(row: UploadedConceptRow): Concept {
  return {
    id: row.id,
    name: row.name,
    prerequisites: [], // uploaded topics are never gated — the student chose to bring this in
    lesson: {
      explanation: row.explanation,
      workedExample: { problem: row.worked_problem, steps: JSON.parse(row.worked_steps) },
      misconceptionWarning: "",
      keyTerms: JSON.parse(row.key_terms),
    },
  };
}

export function getUploadedConcepts(userId: string): Concept[] {
  const rows = db
    .prepare("SELECT * FROM uploaded_concepts WHERE user_id = ? ORDER BY created_at")
    .all(userId) as unknown as UploadedConceptRow[];
  return rows.map(rowToConcept);
}

export function getUploadedConcept(userId: string, conceptId: string): Concept | undefined {
  const row = db
    .prepare("SELECT * FROM uploaded_concepts WHERE user_id = ? AND id = ?")
    .get(userId, conceptId) as UploadedConceptRow | undefined;
  return row ? rowToConcept(row) : undefined;
}

/** Edges discovered between an uploaded topic and a concept it relates to, rendered like any other edge. */
export function getUploadedConceptEdges(userId: string): { source: string; target: string }[] {
  const rows = db
    .prepare("SELECT concept_id, related_concept_id FROM uploaded_concept_edges WHERE user_id = ?")
    .all(userId) as { concept_id: string; related_concept_id: string }[];
  return rows.map((r) => ({ source: r.related_concept_id, target: r.concept_id }));
}

/** Concepts (curriculum or previously uploaded) the user has already learned — candidates the PDF
 * analysis can link a new topic to. */
export function getLearnedConceptOptions(userId: string): { id: string; name: string }[] {
  const rows = db
    .prepare("SELECT concept_id FROM concept_progress WHERE user_id = ? AND learned = 1")
    .all(userId) as { concept_id: string }[];

  const nameById = new Map<string, string>();
  for (const c of getContent().concepts) nameById.set(c.id, c.name);
  for (const c of getUploadedConcepts(userId)) nameById.set(c.id, c.name);

  return rows
    .filter((r) => nameById.has(r.concept_id))
    .map((r) => ({ id: r.concept_id, name: nameById.get(r.concept_id) as string }));
}

const insertConceptStmt = db.prepare(`
  INSERT INTO uploaded_concepts
    (id, user_id, name, explanation, worked_problem, worked_steps, key_terms, source_filename, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertEdgeStmt = db.prepare(`
  INSERT OR IGNORE INTO uploaded_concept_edges (user_id, concept_id, related_concept_id) VALUES (?, ?, ?)
`);

/** Persists a newly-analyzed PDF as a concept in the user's graph, plus any edges to concepts it relates to. */
export function saveUploadedConcept(userId: string, analysis: PdfAnalysis, sourceFilename: string): string {
  const id = `upload-${crypto.randomUUID()}`;
  insertConceptStmt.run(
    id,
    userId,
    analysis.name,
    analysis.explanation,
    analysis.workedExample.problem,
    JSON.stringify(analysis.workedExample.steps),
    JSON.stringify(analysis.keyTerms),
    sourceFilename,
    new Date().toISOString()
  );
  for (const relatedId of analysis.relatedConceptIds) {
    insertEdgeStmt.run(userId, id, relatedId);
  }
  return id;
}
