export type AnswerRevealPlan = { endOffsets: number[]; durationMs: number };

// Reveal whole words (including citations) and finish even a long answer quickly.
export function createAnswerRevealPlan(answer: string): AnswerRevealPlan {
  const endOffsets = Array.from(answer.matchAll(/\S+\s*/g), (match) => match.index + match[0].length);
  return { endOffsets, durationMs: endOffsets.length ? Math.min(900, Math.max(180, endOffsets.length * 16)) : 0 };
}

export function answerRevealOffset(plan: AnswerRevealPlan, elapsedMs: number): number {
  if (!plan.endOffsets.length || elapsedMs <= 0) return 0;
  const progress = Math.min(1, elapsedMs / plan.durationMs);
  return plan.endOffsets[Math.ceil(plan.endOffsets.length * progress) - 1];
}
