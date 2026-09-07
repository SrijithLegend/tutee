export type Decision =
  | { type: "lesson"; conceptId: string; reason: string }
  | { type: "challenge"; conceptId: string; reason: string }
  | { type: "recall_rush"; conceptIds: string[]; reason: string };

/** Concepts below this live retrievability are considered "decayed" and eligible for Recall Rush. */
export const DECAY_THRESHOLD = 0.6;

/** At least this many decayed concepts at once before Recall Rush takes over. */
export const RECALL_RUSH_MIN_DECAYED = 2;

/** A lesson is only ever served on first visit to an unlearned concept in this build. */
export function explainLesson(conceptId: string, conceptName: string): Decision {
  return { type: "lesson", conceptId, reason: `First visit to ${conceptName}` };
}

/** Mirrors the two challenge-selection reasons from the scheduler spec: a collapsed mastery takes priority over plain decay. */
export function explainChallenge(
  conceptId: string,
  conceptName: string,
  mastery: number,
  retrievability: number
): Decision {
  if (mastery < 0.3) {
    return { type: "challenge", conceptId, reason: `Mastery on ${conceptName} collapsed to ${mastery.toFixed(2)}` };
  }
  return {
    type: "challenge",
    conceptId,
    reason: `Retrievability on ${conceptName} dropped to ${retrievability.toFixed(2)}`,
  };
}

/** Recall Rush fires whenever 2+ concepts have decayed below the threshold — checked ahead of any single-concept decision. */
export function explainRecallRush(decayedConceptIds: string[]): Decision {
  return {
    type: "recall_rush",
    conceptIds: decayedConceptIds,
    reason: `${decayedConceptIds.length} concepts dropped below 60% recall`,
  };
}
