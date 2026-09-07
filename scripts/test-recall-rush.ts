import assert from "node:assert/strict";
import { DECAY_THRESHOLD, RECALL_RUSH_MIN_DECAYED, explainRecallRush } from "../src/lib/scheduler";

assert.equal(DECAY_THRESHOLD, 0.6, "decay threshold must match the spec's 60% recall line");
assert.equal(RECALL_RUSH_MIN_DECAYED, 2, "recall rush requires at least 2 decayed concepts");

const decision = explainRecallRush(["a", "b", "c"]);
assert.equal(decision.type, "recall_rush");
assert.deepEqual(decision.type === "recall_rush" ? decision.conceptIds : null, ["a", "b", "c"]);
assert.equal(decision.reason, "3 concepts dropped below 60% recall", "reason must carry a live count");

console.log("recall rush OK: threshold constants and reason string are correct");
