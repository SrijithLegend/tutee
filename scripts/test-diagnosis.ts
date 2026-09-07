import assert from "node:assert/strict";
import db from "../src/lib/db";
import { getContent } from "../src/lib/content";
import { getRetrievability } from "../src/lib/memory";
import { recordAnswer, getDiagnosticQuestions, runDiagnostic, DIAGNOSTIC_QUESTION_IDS } from "../src/lib/diagnosis";
import type { McqQuestion } from "../src/types/content";

const userId = "test-user-f4";

function reset() {
  for (const table of ["fsrs_cards", "concept_progress", "attempts", "clock_offset"]) {
    db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
  }
}

reset();

// getDiagnosticQuestions must never leak the answer key to the client.
const view = getDiagnosticQuestions();
assert.equal(view.length, DIAGNOSTIC_QUESTION_IDS.length, "5 sampled questions");
for (const q of view) {
  for (const opt of q.options) {
    assert.ok(!("correct" in opt), `option ${opt.id} leaks 'correct'`);
    assert.ok(!("misconceptionId" in opt), `option ${opt.id} leaks 'misconceptionId'`);
  }
}

// recordAnswer: EWMA mastery + attempt logging on a miss then a hit.
const content = getContent();
const cltQuestion = content.questions.find((q) => q.id === "q-clt-001") as McqQuestion;

const miss = recordAnswer(userId, cltQuestion, "b"); // tagged mc-add-unlike-terms, incorrect
assert.equal(miss.correct, false);
assert.equal(miss.misconceptionId, "mc-add-unlike-terms");

const hit = recordAnswer(userId, cltQuestion, "a"); // correct
assert.equal(hit.correct, true);
assert.equal(hit.misconceptionId, null);

const progress = db
  .prepare("SELECT mastery FROM concept_progress WHERE user_id = ? AND concept_id = ?")
  .get(userId, "combining-like-terms") as { mastery: number };
const expectedMastery = 0.7 * (0.7 * 0 + 0.3 * 0) + 0.3 * 1; // miss then hit
assert.ok(Math.abs(progress.mastery - expectedMastery) < 1e-9, `mastery EWMA, got ${progress.mastery}`);

const attemptCount = (
  db.prepare("SELECT COUNT(*) as n FROM attempts WHERE user_id = ? AND concept_id = ?").get(userId, "combining-like-terms") as {
    n: number;
  }
).n;
assert.equal(attemptCount, 2, "both attempts logged");

// runDiagnostic: every base (non-remedial) concept ends up with a live FSRS card.
reset();
const answers = DIAGNOSTIC_QUESTION_IDS.map((questionId) => {
  const q = content.questions.find((q) => q.id === questionId) as McqQuestion;
  const correctOption = q.options.find((o) => o.correct)!;
  return { questionId, optionId: correctOption.id, responseMs: 3000 };
});
runDiagnostic(userId, answers);

const untested = content.concepts.filter((c) => !c.remedialOnly && !DIAGNOSTIC_QUESTION_IDS.some((qid) => {
  const q = content.questions.find((q) => q.id === qid) as McqQuestion;
  return q.conceptId === c.id;
}));
assert.ok(untested.length > 0, "sanity: some concepts were not directly sampled");

for (const c of content.concepts.filter((c) => !c.remedialOnly)) {
  const r = getRetrievability(userId, c.id);
  assert.ok(r > 0, `concept "${c.id}" should have an initialized FSRS card, got retrievability ${r}`);
}

reset();
console.log("diagnosis engine OK: no answer-key leak, mastery EWMA correct, attempts logged, every base concept seeded by the 5-question diagnostic");
