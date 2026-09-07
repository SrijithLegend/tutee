import assert from "node:assert/strict";
import db from "../src/lib/db";
import { markLearned, getUserGraph } from "../src/lib/path";

const userId = "test-user-f5";
const conceptId = "isolating-variables";

db.prepare("DELETE FROM concept_progress WHERE user_id = ?").run(userId);

markLearned(userId, conceptId);
let row = db
  .prepare("SELECT learned, mastery FROM concept_progress WHERE user_id = ? AND concept_id = ?")
  .get(userId, conceptId) as { learned: number; mastery: number };
assert.equal(row.learned, 1, "marks learned on a fresh row");
assert.equal(row.mastery, 0, "fresh row defaults mastery to 0");

// Simulate prior mastery from real answers, then confirm markLearned doesn't clobber it.
db.prepare(
  "INSERT INTO concept_progress (user_id, concept_id, learned, mastery) VALUES (?, ?, 0, 0.42) ON CONFLICT(user_id, concept_id) DO UPDATE SET learned = 0, mastery = 0.42"
).run(userId, conceptId);
markLearned(userId, conceptId);
row = db
  .prepare("SELECT learned, mastery FROM concept_progress WHERE user_id = ? AND concept_id = ?")
  .get(userId, conceptId) as { learned: number; mastery: number };
assert.equal(row.learned, 1, "marks learned on an existing row");
assert.ok(Math.abs(row.mastery - 0.42) < 1e-9, `markLearned must not touch existing mastery, got ${row.mastery}`);

// The graph must reflect the "learn" -> not-locked-but-unlearned transition disappearing once learned.
const graph = getUserGraph(userId);
const node = graph.nodes.find((n) => n.id === conceptId)!;
assert.notEqual(node.state, "learn", `node should no longer be in "learn" state once marked learned, got ${node.state}`);

db.prepare("DELETE FROM concept_progress WHERE user_id = ?").run(userId);
console.log("lesson layer OK: markLearned is idempotent, preserves mastery, and flips graph state");
