import { describe, expect, it } from "vitest";
import { HISTORY_TOKEN_BUDGET, estimateMessageTokens, estimateTokens } from "./tokenBudget";
import type { Message } from "./types";

function message(id: string, content: string): Message {
  return { id, role: "user", content, createdAt: 0, status: "complete" };
}

describe("estimateTokens", () => {
  it("uses a ~4-chars-per-token heuristic", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(41))).toBe(11);
  });
});

describe("estimateMessageTokens", () => {
  it("adds a small fixed overhead to the content estimate", () => {
    expect(estimateMessageTokens(message("1", "abcd"))).toBe(5);
    expect(estimateMessageTokens(message("2", ""))).toBe(4);
  });
});

describe("HISTORY_TOKEN_BUDGET", () => {
  it("is a positive, cloud-sized budget for xAI's hosted models", () => {
    expect(HISTORY_TOKEN_BUDGET).toBeGreaterThan(0);
  });
});
