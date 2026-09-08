import { getContent } from "./content";
import { gradeAnswer, Rating } from "./memory";

/** Explaining a concept back reinforces retention (the protégé effect) — this exercise scores that explanation and reinforces its FSRS card accordingly. No LLM: matching is plain substring search against the concept's authored keyTerms. */
export interface TeachBackResult {
  matchedTerms: string[];
  totalTerms: number;
  strong: boolean;
}

const STRONG_THRESHOLD = 0.6;

export function scoreExplanation(conceptId: string, explanation: string): TeachBackResult {
  const concept = getContent().concepts.find((c) => c.id === conceptId);
  if (!concept) throw new Error(`Unknown concept "${conceptId}"`);

  const normalized = explanation.toLowerCase();
  const matchedTerms = concept.lesson.keyTerms.filter((term) => normalized.includes(term.toLowerCase()));
  const totalTerms = concept.lesson.keyTerms.length;
  return { matchedTerms, totalTerms, strong: matchedTerms.length / totalTerms >= STRONG_THRESHOLD };
}

/** Records a teach-back attempt: reinforces the concept's FSRS card (Easy for a strong explanation, Good for a partial one), skips grading entirely if nothing relevant was said. */
export function recordTeachBack(userId: string, conceptId: string, explanation: string): TeachBackResult {
  const result = scoreExplanation(conceptId, explanation);
  if (result.matchedTerms.length === 0) return result;
  gradeAnswer(userId, conceptId, result.strong ? Rating.Easy : Rating.Good);
  return result;
}
