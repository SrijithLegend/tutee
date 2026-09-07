import db from "./db";
import { now } from "./clock";
import { getContent } from "./content";
import { gradeAnswer, Rating, type Grade } from "./memory";
import type { McqQuestion } from "@/types/content";

/** Deterministic sample spanning the DAG (roots + mid-tier), reused every diagnostic run for demo reliability. */
export const DIAGNOSTIC_QUESTION_IDS = ["q-iv-001", "q-dr-001", "q-clt-001", "q-tse-001", "q-sif-001"];

export interface AnswerResult {
  correct: boolean;
  misconceptionId: string | null;
}

interface ProgressRow {
  learned: number;
  mastery: number;
}

const getProgressRowStmt = db.prepare(
  "SELECT learned, mastery FROM concept_progress WHERE user_id = ? AND concept_id = ?"
);

const upsertProgressStmt = db.prepare(`
  INSERT INTO concept_progress (user_id, concept_id, learned, mastery) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, concept_id) DO UPDATE SET mastery = excluded.mastery
`);

const insertAttemptStmt = db.prepare(`
  INSERT INTO attempts (user_id, question_id, concept_id, correct, misconception_id, response_ms, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const priorResponseTimesStmt = db.prepare(
  "SELECT response_ms FROM attempts WHERE user_id = ? AND concept_id = ? AND correct = 1 AND response_ms IS NOT NULL ORDER BY response_ms"
);

function medianResponseMs(userId: string, conceptId: string): number | undefined {
  const rows = priorResponseTimesStmt.all(userId, conceptId) as { response_ms: number }[];
  if (rows.length === 0) return undefined;
  const mid = Math.floor(rows.length / 2);
  return rows.length % 2 === 1 ? rows[mid].response_ms : (rows[mid - 1].response_ms + rows[mid].response_ms) / 2;
}

/** Maps an answer outcome to an FSRS rating. No response-time history yet defaults to Good. */
function ratingFor(correct: boolean, responseMs: number | undefined, medianMs: number | undefined): Grade {
  if (!correct) return Rating.Again;
  if (medianMs != null && responseMs != null) {
    if (responseMs < medianMs * 0.6) return Rating.Easy;
    if (responseMs > medianMs * 1.5) return Rating.Hard;
  }
  return Rating.Good;
}

/** Records one graded MCQ attempt: logs it, updates mastery (EWMA), and grades the FSRS card. */
export function recordAnswer(
  userId: string,
  question: McqQuestion,
  optionId: string,
  responseMs?: number
): AnswerResult {
  const option = question.options.find((o) => o.id === optionId);
  if (!option) throw new Error(`Unknown option "${optionId}" for question "${question.id}"`);
  const correct = option.correct;

  const median = medianResponseMs(userId, question.conceptId);
  const rating = ratingFor(correct, responseMs, median);

  insertAttemptStmt.run(
    userId,
    question.id,
    question.conceptId,
    correct ? 1 : 0,
    option.misconceptionId,
    responseMs ?? null,
    now(userId).toISOString()
  );

  const existing = getProgressRowStmt.get(userId, question.conceptId) as ProgressRow | undefined;
  const nextMastery = 0.7 * (existing?.mastery ?? 0) + 0.3 * (correct ? 1 : 0);
  upsertProgressStmt.run(userId, question.conceptId, existing?.learned ?? 0, nextMastery);

  gradeAnswer(userId, question.conceptId, rating);

  return { correct, misconceptionId: option.misconceptionId };
}

export interface DiagnosticQuestionView {
  id: string;
  conceptId: string;
  prompt: string;
  options: { id: string; text: string }[];
}

/** The 5 sampled questions, with correct/misconceptionId stripped before sending to the client. */
export function getDiagnosticQuestions(): DiagnosticQuestionView[] {
  const content = getContent();
  return DIAGNOSTIC_QUESTION_IDS.map((id) => {
    const q = content.questions.find((q) => q.id === id) as McqQuestion;
    return {
      id: q.id,
      conceptId: q.conceptId,
      prompt: q.prompt,
      options: q.options.map((o) => ({ id: o.id, text: o.text })),
    };
  });
}

export interface DiagnosticAnswer {
  questionId: string;
  optionId: string;
  responseMs?: number;
}

/** Grades the 5 sampled answers, then seeds a neutral FSRS baseline for every other concept. */
export function runDiagnostic(userId: string, answers: DiagnosticAnswer[]): void {
  const content = getContent();
  const testedConceptIds = new Set<string>();

  for (const answer of answers) {
    const question = content.questions.find((q) => q.id === answer.questionId);
    if (!question || question.gameType !== "mcq") continue;
    recordAnswer(userId, question, answer.optionId, answer.responseMs);
    testedConceptIds.add(question.conceptId);
  }

  for (const concept of content.concepts) {
    if (concept.remedialOnly || testedConceptIds.has(concept.id)) continue;
    gradeAnswer(userId, concept.id, Rating.Good);
  }
}
