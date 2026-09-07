import assert from "node:assert/strict";
import db from "../src/lib/db";
import { getContent } from "../src/lib/content";
import { recordAnswer, countRecentStrikes } from "../src/lib/diagnosis";
import { getUserGraph } from "../src/lib/path";
import type { McqQuestion } from "../src/types/content";

const userId = "test-user-f7";

function reset() {
  for (const table of ["fsrs_cards", "concept_progress", "attempts", "injected_nodes"]) {
    db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
  }
}
reset();

const content = getContent();
function findQ(id: string) {
  return content.questions.find((q) => q.id === id) as McqQuestion;
}

// Strike 1 and 2: no injection yet.
const r1 = recordAnswer(userId, findQ("q-clt-001"), "b"); // mc-add-unlike-terms
assert.equal(r1.strikeCount, 1);
assert.equal(r1.injected, false);

const r2 = recordAnswer(userId, findQ("q-clt-002"), "b"); // different question, same misconception
assert.equal(r2.strikeCount, 2);
assert.equal(r2.injected, false);

let graph = getUserGraph(userId);
assert.ok(!graph.nodes.some((n) => n.id === "distributive-recap"), "remedial node must not appear before the 3rd strike");

// Strike 3: injects.
const r3 = recordAnswer(userId, findQ("q-clt-003"), "b");
assert.equal(r3.strikeCount, 3);
assert.equal(r3.injected, true, "3rd strike on the same misconception must inject the remedial node");

graph = getUserGraph(userId);
const remedial = graph.nodes.find((n) => n.id === "distributive-recap");
assert.ok(remedial, "remedial node must be visible in the graph immediately, no reload needed");
assert.equal(remedial!.injected, true);
assert.ok(remedial!.retrievability > 0, "injected node should have a seeded, visible FSRS card");

// Edges must be rewired: isolating-variables -> distributive-recap -> combining-like-terms,
// and the direct isolating-variables -> combining-like-terms edge must be gone.
const hasDirectEdge = graph.edges.some(
  (e) => e.source === "isolating-variables" && e.target === "combining-like-terms"
);
const hasRewiredIn = graph.edges.some((e) => e.source === "isolating-variables" && e.target === "distributive-recap");
const hasRewiredOut = graph.edges.some((e) => e.source === "distributive-recap" && e.target === "combining-like-terms");
assert.ok(!hasDirectEdge, "direct prerequisite edge must be replaced, not just supplemented");
assert.ok(hasRewiredIn, "prerequisite must now point into the remedial node");
assert.ok(hasRewiredOut, "remedial node must now point into the failing concept");

// A 4th strike must not re-inject or duplicate the node.
const r4 = recordAnswer(userId, findQ("q-clt-001"), "b");
assert.equal(r4.injected, false, "injection must be idempotent");
graph = getUserGraph(userId);
assert.equal(graph.nodes.filter((n) => n.id === "distributive-recap").length, 1, "no duplicate node");

// A misconception with no remedialConceptId must never inject anything.
reset();
const noRemedy = recordAnswer(userId, findQ("q-clt-001"), "c"); // mc-sign-error, remedialConceptId: null
for (let i = 0; i < 3; i++) recordAnswer(userId, findQ("q-clt-00" + ((i % 3) + 1)), "c");
assert.equal(countRecentStrikes(userId, "mc-sign-error") >= 3, true, "sanity: strikes did accumulate");
graph = getUserGraph(userId);
const baseConceptCount = content.concepts.filter((c) => !c.remedialOnly).length;
assert.equal(
  graph.nodes.length,
  baseConceptCount,
  "misconceptions with remedialConceptId: null must never inject a node"
);

reset();
console.log("injection OK: no injection before 3rd strike, correct edge rewiring on injection, idempotent on repeat, null-remedy misconceptions never inject");
