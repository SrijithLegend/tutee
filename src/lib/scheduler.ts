export interface Decision {
  type: "lesson" | "challenge";
  conceptId: string;
  reason: string;
}

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
