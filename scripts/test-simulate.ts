import assert from "node:assert/strict";
import db from "../src/lib/db";
import { advanceClock } from "../src/lib/clock";
import { gradeAnswer, Rating } from "../src/lib/memory";
import { getUserGraph } from "../src/lib/path";

const userId = "test-user-f9";
const conceptId = "isolating-variables";

function reset() {
  for (const table of ["fsrs_cards", "clock_offset"]) {
    db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
  }
}
reset();

gradeAnswer(userId, conceptId, Rating.Good);

const before = getUserGraph(userId);
const beforeNode = before.nodes.find((n) => n.id === conceptId)!;
assert.ok(beforeNode.retrievability > 0.9, `freshly graded node should read near 1, got ${beforeNode.retrievability}`);

advanceClock(userId, 7);

const after = getUserGraph(userId);
const afterNode = after.nodes.find((n) => n.id === conceptId)!;
assert.ok(
  afterNode.retrievability < beforeNode.retrievability,
  `graph must reflect decay after simulating 7 days: ${afterNode.retrievability} should be < ${beforeNode.retrievability}`
);

reset();
console.log(`simulate OK: graph retrievability dropped from ${beforeNode.retrievability.toFixed(3)} to ${afterNode.retrievability.toFixed(3)} after advancing 7 days`);
