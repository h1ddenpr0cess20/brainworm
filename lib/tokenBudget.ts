// Token estimation for history-budget decisions. Brainworm talks to a single
// hosted provider (xAI), so unlike smoketest's per-provider budget this is
// just one constant sized for Grok's context window.

import type { Message } from "./types";

/** Estimates the token count of a string using a ~4-chars-per-token heuristic. */
export function estimateTokens(text: string | undefined | null): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Token cost of one message, including a small fixed role/structure overhead. */
export function estimateMessageTokens(message: Message): number {
  return estimateTokens(message.content) + 4;
}

/** xAI's hosted Grok models expose context windows well above 128k tokens. */
export const HISTORY_TOKEN_BUDGET = 128_000;
