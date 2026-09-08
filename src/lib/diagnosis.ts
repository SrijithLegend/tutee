import db from "./db";
import { now } from "./clock";
import { getContent } from "./content";
import { gradeAnswer, Rating, type Grade } from "./memory";
import { injectRemedialNode } from "./path";
import type { McqQuestion, Question, SequenceQuestion } from "@/types/content";

/** Deterministic sample spanning the DAG (roots + mid-tier), reused every diagnostic run for demo reliability. */
export const DIAGNOSTIC_QUESTION_IDS = ["q-iv-001", "q-dr-001", "q-clt-001", "q-tse-001", "q-sif-001"];

export interface AnswerResult {
  correct: boolean;
  misconceptionId: string | null;
  /** Strikes on this misconception within the user's last 20 attempts. Null when the answer was correct. */
  strikeCount: number | null;
  /** True if this answer was the 3rd strike and a remedial node was just injected. */
  injected: boolean;
}

const recentAttemptsStmt = db.prepare(
  "SELECT misconception_id FROM attempts WHERE user_id = ? ORDER BY id DESC LIMIT 20"
);

/** How many of the user's last 20 attempts (any concept) were tagged with this misconception. */
export function countRecentStrikes(userId: string, misconceptionId: string): number {
  const rows = recentAttemptsStmt.all(userId) as { misconception_id: string | null }[];
  return rows.filter((r) => r.misconception_id === misconceptionId).length;
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

/** Shared grading core: logs the attempt, updates mastery (EWMA), grades the FSRS card, and checks for a 3rd strike. */
function applyGradedAttempt(
  userId: string,
  questionId: string,
  conceptId: string,
  correct: boolean,
  misconceptionId: string | null,
  responseMs?: number
): { strikeCount: number | null; injected: boolean } {
  const median = medianResponseMs(userId, conceptId);
  const rating = ratingFor(correct, responseMs, median);

  insertAttemptStmt.run(
    userId,
    questionId,
    conceptId,
    correct ? 1 : 0,
    misconceptionId,
    responseMs ?? null,
    now(userId).toISOString()
  );

  const existing = getProgressRowStmt.get(userId, conceptId) as ProgressRow | undefined;
  const nextMastery = 0.7 * (existing?.mastery ?? 0) + 0.3 * (correct ? 1 : 0);
  upsertProgressStmt.run(userId, conceptId, existing?.learned ?? 0, nextMastery);

  gradeAnswer(userId, conceptId, rating);

  if (correct || !misconceptionId) return { strikeCount: null, injected: false };

  const strikeCount = countRecentStrikes(userId, misconceptionId);
  const injected = strikeCount >= 3 && injectRemedialNode(userId, misconceptionId);
  return { strikeCount, injected };
}

/** Records one graded MCQ attempt. */
export function recordAnswer(
  userId: string,
  question: McqQuestion,
  optionId: string,
  responseMs?: number
): AnswerResult {
  const option = question.options.find((o) => o.id === optionId);
  if (!option) throw new Error(`Unknown option "${optionId}" for question "${question.id}"`);
  const correct = option.correct;

  const { strikeCount, injected } = applyGradedAttempt(
    userId,
    question.id,
    question.conceptId,
    correct,
    option.misconceptionId,
    responseMs
  );
  return { correct, misconceptionId: option.misconceptionId, strikeCount, injected };
}

export interface SequenceAnswerResult {
  correct: boolean;
}

/** Records one graded sequence attempt. Ordering questions carry no misconception tagging, so strikes never apply. */
export function recordSequenceAnswer(
  userId: string,
  question: SequenceQuestion,
  submittedOrder: number[],
  responseMs?: number
): SequenceAnswerResult {
  const correct =
    submittedOrder.length === question.correctOrder.length &&
    submittedOrder.every((v, i) => v === question.correctOrder[i]);
  applyGradedAttempt(userId, question.id, question.conceptId, correct, null, responseMs);
  return { correct };
}

export type PublicQuestion =
  | { gameType: "mcq"; id: string; conceptId: string; prompt: string; options: { id: string; text: string }[] }
  | { gameType: "sequence"; id: string; conceptId: string; prompt: string; items: string[]; itemOriginalIndices: number[] };

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Strips the answer key before a question goes to the client.
 * Every authored MCQ question happens to put the correct option first, so display order is
 * shuffled here — grading still keys off each option's own stable id, unaffected by position.
 * Sequence items are shuffled the same way; content stores them in correct order.
 */
function toPublicQuestion(q: Question): PublicQuestion {
  if (q.gameType === "mcq") {
    return {
      gameType: "mcq",
      id: q.id,
      conceptId: q.conceptId,
      prompt: q.prompt,
      options: shuffled(q.options.map((o) => ({ id: o.id, text: o.text }))),
    };
  }
  const itemOriginalIndices = shuffled(q.items.map((_, i) => i));
  return {
    gameType: "sequence",
    id: q.id,
    conceptId: q.conceptId,
    prompt: q.prompt,
    items: itemOriginalIndices.map((i) => q.items[i]),
    itemOriginalIndices,
  };
}

/** The 5 sampled questions, with correct/misconceptionId stripped before sending to the client. */
export function getDiagnosticQuestions(): PublicQuestion[] {
  const content = getContent();
  return DIAGNOSTIC_QUESTION_IDS.map((id) => toPublicQuestion(content.questions.find((q) => q.id === id) as McqQuestion));
}

const seenQuestionIdsStmt = db.prepare(
  "SELECT DISTINCT question_id FROM attempts WHERE user_id = ? AND concept_id = ?"
);

/** Picks the next question for a concept (either game type): the first one this user hasn't attempted yet, cycling back once all have been seen. */
export function selectQuestion(userId: string, conceptId: string): PublicQuestion {
  const content = getContent();
  const candidates = content.questions.filter((q) => q.conceptId === conceptId);
  if (candidates.length === 0) throw new Error(`No questions for concept "${conceptId}"`);

  const seenIds = new Set(
    (seenQuestionIdsStmt.all(userId, conceptId) as { question_id: string }[]).map((r) => r.question_id)
  );
  const unseen = candidates.find((q) => !seenIds.has(q.id));
  return toPublicQuestion(unseen ?? candidates[0]);
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
