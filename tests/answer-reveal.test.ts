import assert from "node:assert/strict";
import test from "node:test";
import { answerRevealOffset, createAnswerRevealPlan } from "../lib/answer-reveal";

test("empty answers need no animation", () => {
  const plan = createAnswerRevealPlan("");
  assert.equal(plan.durationMs, 0);
  assert.equal(answerRevealOffset(plan, 500), 0);
});
test("reveal preserves whitespace, paragraphs and whole citations", () => {
  const answer = "  Earth is a planet. [1]\n\nIt has oceans. [2]  ";
  const plan = createAnswerRevealPlan(answer);
  assert.equal(plan.endOffsets.at(-1), answer.length);
  for (const offset of plan.endOffsets) assert.doesNotMatch(answer.slice(0, offset), /\[\d*$/);
  assert.equal(answer.slice(0, answerRevealOffset(plan, plan.durationMs)), answer);
});
test("reveal starts empty and never runs past the end", () => {
  const answer = "Hello from Sasta AI.";
  const plan = createAnswerRevealPlan(answer);
  assert.equal(answerRevealOffset(plan, -1), 0);
  assert.equal(answerRevealOffset(plan, 0), 0);
  assert.equal(answerRevealOffset(plan, 10_000), answer.length);
});
test("reveal makes monotonic progress at different frame rates", () => {
  const plan = createAnswerRevealPlan("one two three four five six seven eight nine ten");
  for (const step of [8, 16, 33, 100]) {
    let previous = 0;
    for (let time = 0; time <= plan.durationMs + step; time += step) {
      const offset = answerRevealOffset(plan, time);
      assert.ok(offset >= previous);
      previous = offset;
    }
    assert.equal(previous, plan.endOffsets.at(-1));
  }
});
test("long answers finish within 900ms instead of typing for many seconds", () => {
  const plan = createAnswerRevealPlan("word ".repeat(1200));
  assert.equal(plan.durationMs, 900);
  assert.equal(answerRevealOffset(plan, 900), 6000);
});
test("short answers have a brief, bounded reveal", () => {
  const plan = createAnswerRevealPlan("12 + 8 = 20");
  assert.equal(plan.durationMs, 180);
  assert.equal(answerRevealOffset(plan, 180), 11);
});
