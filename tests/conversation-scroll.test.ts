import assert from "node:assert/strict";
import test from "node:test";
import { advanceConversationScroll, type ConversationScrollState } from "../lib/conversation-scroll";

const idle: ConversationScrollState = { turn: null, interrupted: false };
const pending = { id: "turn-1", status: "pending" as const };

test("a submitted question aligns immediately", () => {
  assert.equal(advanceConversationScroll(idle, pending).shouldScroll, true);
});
test("answer arrival re-aligns after the pending row's scroll was clamped", () => {
  const { state } = advanceConversationScroll(idle, pending);
  assert.equal(advanceConversationScroll(state, { ...pending, status: "complete" }).shouldScroll, true);
});
test("typing, image loads and repeated renders do not scroll again", () => {
  const { state } = advanceConversationScroll(idle, pending);
  assert.equal(advanceConversationScroll(state, pending).shouldScroll, false);
  const completed = advanceConversationScroll(state, { ...pending, status: "complete" }).state;
  assert.equal(advanceConversationScroll(completed, completed.turn!).shouldScroll, false);
});
test("manual scrolling while waiting cancels answer-arrival scrolling", () => {
  const { state } = advanceConversationScroll(idle, pending);
  assert.equal(advanceConversationScroll({ ...state, interrupted: true }, { ...pending, status: "complete" }).shouldScroll, false);
});
test("the next question starts a fresh automatic alignment", () => {
  const interrupted: ConversationScrollState = { turn: pending, interrupted: true };
  const next = advanceConversationScroll(interrupted, { id: "turn-2", status: "pending" });
  assert.equal(next.shouldScroll, true);
  assert.equal(next.state.interrupted, false);
});
test("an error is brought into view without retrying the scroll indefinitely", () => {
  const { state } = advanceConversationScroll(idle, pending);
  const error = advanceConversationScroll(state, { ...pending, status: "error" });
  assert.equal(error.shouldScroll, true);
  assert.equal(advanceConversationScroll(error.state, error.state.turn!).shouldScroll, false);
});
test("an immediately available answer still aligns the new question", () => {
  assert.equal(advanceConversationScroll(idle, { ...pending, status: "complete" }).shouldScroll, true);
});
