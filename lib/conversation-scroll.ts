export type ConversationScrollTurn = { id: string; status: "pending" | "complete" | "error" };
export type ConversationScrollState = {
  turn: ConversationScrollTurn | null;
  interrupted: boolean;
};

export function advanceConversationScroll(state: ConversationScrollState, turn: ConversationScrollTurn) {
  const isNewQuestion = state.turn?.id !== turn.id;
  const answerArrived = state.turn?.status === "pending" && turn.status !== "pending";
  const next: ConversationScrollState = {
    turn,
    interrupted: isNewQuestion ? false : state.interrupted,
  };
  return {
    state: next,
    // Re-align once the answer creates actual scrollable space. Never follow
    // typing/images or pull someone away after they choose to scroll themselves.
    shouldScroll: isNewQuestion || (answerArrived && !next.interrupted),
  };
}
