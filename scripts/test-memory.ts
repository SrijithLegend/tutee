import assert from "node:assert/strict";
import db from "../src/lib/db";
import { advanceClock } from "../src/lib/clock";
import { getRetrievability, gradeAnswer, Rating } from "../src/lib/memory";

const userId = "test-user-f2";
const conceptId = "test-concept-f2";

db.prepare("DELETE FROM fsrs_cards WHERE user_id = ?").run(userId);
db.prepare("DELETE FROM clock_offset WHERE user_id = ?").run(userId);

assert.equal(getRetrievability(userId, conceptId), 0, "ungraded concept starts at 0 retrievability");

gradeAnswer(userId, conceptId, Rating.Good);
const justGraded = getRetrievability(userId, conceptId);
assert.ok(justGraded > 0.9, `retrievability right after grading should be near 1, got ${justGraded}`);

advanceClock(userId, 30);
const decayed = getRetrievability(userId, conceptId);
assert.ok(decayed < justGraded, `retrievability should decrease as time advances (${decayed} < ${justGraded})`);

gradeAnswer(userId, conceptId, Rating.Again);
const regraded = getRetrievability(userId, conceptId);
assert.ok(regraded > decayed, `grading again should raise retrievability back up (${regraded} > ${decayed})`);

db.prepare("DELETE FROM fsrs_cards WHERE user_id = ?").run(userId);
db.prepare("DELETE FROM clock_offset WHERE user_id = ?").run(userId);

console.log("memory engine OK: decay over simulated time + grading update both verified");
