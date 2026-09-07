import assert from "node:assert/strict";
import db from "../src/lib/db";
import { getContent } from "../src/lib/content";
import { recordAnswer, selectQuestion } from "../src/lib/diagnosis";
import type { McqQuestion } from "../src/types/content";

const userId = "test-user-f6";
const conceptId = "combining-like-terms"; // has 3 questions: q-clt-001, 002, 003

function reset() {
  for (const table of ["fsrs_cards", "concept_progress", "attempts"]) {
    db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
  }
}
reset();

const content = getContent();
function findQ(id: string) {
  return content.questions.find((q) => q.id === id) as McqQuestion;
}

// selectQuestion never leaks the answer key.
const q1 = selectQuestion(userId, conceptId);
for (const opt of q1.options) {
  assert.ok(!("correct" in opt) && !("misconceptionId" in opt), `option ${opt.id} leaks answer key`);
}
assert.equal(q1.id, "q-clt-001", "first unseen question should be the first authored one");

// Answering it should make selectQuestion move on to the next unseen question.
recordAnswer(userId, findQ(q1.id), "a");
const q2 = selectQuestion(userId, conceptId);
assert.equal(q2.id, "q-clt-002", "second call should skip the now-seen question");

recordAnswer(userId, findQ(q2.id), "a");
const q3 = selectQuestion(userId, conceptId);
assert.equal(q3.id, "q-clt-003", "third call should skip both seen questions");

// Once every question has been seen, it must cycle back rather than error.
recordAnswer(userId, findQ(q3.id), "a");
const q4 = selectQuestion(userId, conceptId);
assert.equal(q4.id, "q-clt-001", "cycles back to the first question once all are seen");

// A wrong answer tags the distractor's misconception and grades FSRS (Again).
const miss = recordAnswer(userId, findQ("q-clt-001"), "b");
assert.equal(miss.correct, false);
assert.equal(miss.misconceptionId, "mc-add-unlike-terms");
const card = db.prepare("SELECT state FROM fsrs_cards WHERE user_id = ? AND concept_id = ?").get(userId, conceptId);
assert.ok(card, "FSRS card exists after grading");

reset();
console.log("MCQ battle OK: unseen-question cycling correct, no answer-key leak, misconception tag + FSRS grading on miss");
