import assert from "node:assert/strict";
import db from "../src/lib/db";
import { scoreExplanation, recordTeachBack } from "../src/lib/teachback";

const userId = "test-user-f12";
const conceptId = "isolating-variables"; // keyTerms: ["inverse operation", "both sides", "balance"]

function reset() {
  db.prepare("DELETE FROM fsrs_cards WHERE user_id = ?").run(userId);
}
reset();

// A strong explanation hits most key terms.
const strong = scoreExplanation(
  conceptId,
  "You isolate x by applying the inverse operation to both sides to keep the equation in balance."
);
assert.equal(strong.totalTerms, 3);
assert.deepEqual([...strong.matchedTerms].sort(), ["balance", "both sides", "inverse operation"]);
assert.equal(strong.strong, true);

// A weak explanation touches one idea but not enough to count as strong.
const weak = scoreExplanation(conceptId, "You just move the numbers to the other side.");
assert.equal(weak.matchedTerms.length, 0, "vague paraphrase without key terms should match nothing");
assert.equal(weak.strong, false);

// A totally unrelated explanation must not grade the FSRS card at all.
const nothingResult = recordTeachBack(userId, conceptId, "I like pizza.");
assert.equal(nothingResult.matchedTerms.length, 0);
const cardAfterNothing = db.prepare("SELECT 1 FROM fsrs_cards WHERE user_id = ? AND concept_id = ?").get(userId, conceptId);
assert.equal(cardAfterNothing, undefined, "no matched terms must mean no FSRS grading at all");

// A strong explanation must grade the card (Easy-equivalent reinforcement).
const strongResult = recordTeachBack(
  userId,
  conceptId,
  "To isolate the variable you undo it with the inverse operation on both sides, keeping balance."
);
assert.equal(strongResult.strong, true);
const cardAfterStrong = db
  .prepare("SELECT stability FROM fsrs_cards WHERE user_id = ? AND concept_id = ?")
  .get(userId, conceptId) as { stability: number } | undefined;
assert.ok(cardAfterStrong, "a strong teach-back must create/grade the FSRS card");

reset();
console.log("teach-back OK: substring scoring correct, ungraded on a no-match attempt, FSRS reinforced on a strong explanation");
