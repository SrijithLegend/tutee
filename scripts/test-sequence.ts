import assert from "node:assert/strict";
import db from "../src/lib/db";
import { getContent } from "../src/lib/content";
import { recordAnswer, recordSequenceAnswer, selectQuestion } from "../src/lib/diagnosis";
import type { McqQuestion, SequenceQuestion } from "../src/types/content";

const userId = "test-user-f11";
const conceptId = "isolating-variables"; // q-iv-001,002,003 (mcq) then q-solve-seq-001 (sequence)

function reset() {
  for (const table of ["fsrs_cards", "concept_progress", "attempts"]) {
    db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
  }
}
reset();

const content = getContent();
function findQ(id: string) {
  return content.questions.find((q) => q.id === id)!;
}

// Burn through the 3 mcq questions so selectQuestion reaches the sequence question.
for (const id of ["q-iv-001", "q-iv-002", "q-iv-003"]) {
  recordAnswer(userId, findQ(id) as McqQuestion, "a");
}

const served = selectQuestion(userId, conceptId);
assert.equal(served.gameType, "sequence", "4th unseen question for this concept should be the sequence one");
if (served.gameType !== "sequence") throw new Error("unreachable");
assert.equal(served.id, "q-solve-seq-001");

const original = (findQ("q-solve-seq-001") as SequenceQuestion).items;

// Served items must be a shuffle of the original set (same multiset), and must not leak correctOrder.
assert.equal(served.items.length, original.length);
assert.deepEqual([...served.items].sort(), [...original].sort(), "shuffled items must be the same set of steps");
assert.ok(!("correctOrder" in served), "correctOrder must never be sent to the client");

// itemOriginalIndices must correctly map each shown item back to its true position.
for (let i = 0; i < served.items.length; i++) {
  assert.equal(served.items[i], original[served.itemOriginalIndices[i]], "index mapping must match the shown text");
}

// Submitting the CORRECT order (regardless of how it was shuffled) must grade as correct.
const correctOrderSubmission = original.map((_, i) => i); // = question.correctOrder, which is identity in this content
const hit = recordSequenceAnswer(userId, findQ("q-solve-seq-001") as SequenceQuestion, correctOrderSubmission, 4000);
assert.equal(hit.correct, true);

const progress = db
  .prepare("SELECT mastery FROM concept_progress WHERE user_id = ? AND concept_id = ?")
  .get(userId, conceptId) as { mastery: number };
assert.ok(progress.mastery > 0, "a correct sequence answer must raise mastery");

// A scrambled (wrong) order must grade as incorrect.
const wrongOrderSubmission = [...correctOrderSubmission].reverse();
const miss = recordSequenceAnswer(userId, findQ("q-solve-seq-001") as SequenceQuestion, wrongOrderSubmission, 4000);
assert.equal(miss.correct, false);

const card = db.prepare("SELECT state FROM fsrs_cards WHERE user_id = ? AND concept_id = ?").get(userId, conceptId);
assert.ok(card, "FSRS card exists after grading a sequence answer");

reset();
console.log("sequence OK: served items are a genuine shuffle with no answer leak, correct/incorrect ordering grades right, FSRS updates");
