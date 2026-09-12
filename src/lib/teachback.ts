import { getContent } from "./content";
import { gradeAnswer, Rating } from "./memory";
import { getUploadedConcept } from "./uploads";

/** Explaining a concept back reinforces retention (the protégé effect) — this exercise scores that explanation and reinforces its FSRS card accordingly. No LLM: matching is word-overlap against the concept's authored keyTerms, not exact-phrase search — a real explanation rarely repeats a phrase verbatim. */
export interface TeachBackResult {
  matchedTerms: string[];
  totalTerms: number;
  strong: boolean;
}

const STRONG_THRESHOLD = 0.6;
/** A keyTerm counts as covered once at least this share of its own words show up in the explanation. */
const TERM_WORD_OVERLAP = 0.5;

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

export function scoreExplanation(conceptId: string, explanation: string, userId?: string): TeachBackResult {
  const concept =
    getContent().concepts.find((c) => c.id === conceptId) ?? (userId ? getUploadedConcept(userId, conceptId) : undefined);
  if (!concept) throw new Error(`Unknown concept "${conceptId}"`);

  const explanationWords = new Set(words(explanation));
  const matchedTerms = concept.lesson.keyTerms.filter((term) => {
    const termWords = words(term);
    const hits = termWords.filter((w) => explanationWords.has(w)).length;
    return hits / termWords.length >= TERM_WORD_OVERLAP;
  });
  const totalTerms = concept.lesson.keyTerms.length;
  return { matchedTerms, totalTerms, strong: matchedTerms.length / totalTerms >= STRONG_THRESHOLD };
}

/** Records a teach-back attempt: reinforces the concept's FSRS card (Easy for a strong explanation, Good for a partial one), skips grading entirely if nothing relevant was said. */
export function recordTeachBack(userId: string, conceptId: string, explanation: string): TeachBackResult {
  const result = scoreExplanation(conceptId, explanation, userId);
  if (result.matchedTerms.length === 0) return result;
  gradeAnswer(userId, conceptId, result.strong ? Rating.Easy : Rating.Good);
  return result;
}
