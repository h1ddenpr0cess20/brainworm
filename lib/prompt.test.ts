import { describe, expect, it } from "vitest";
import {
  BRAINWORM_CODING_PROMPT,
  BRAINWORM_SYSTEM_PROMPT,
  codingModeInstruction,
  makeConversationTitle,
  mcpModeInstruction,
} from "./prompt";

describe("Brainworm prompt helpers", () => {
  it("keeps the personality specific without turning every line into a pun", () => {
    expect(BRAINWORM_SYSTEM_PROMPT).toContain("scholarly bookworm");
    expect(BRAINWORM_SYSTEM_PROMPT).toContain("constant worm puns are compost");
  });

  it("keeps plan mode read-only and explicit about browser limitations", () => {
    expect(BRAINWORM_CODING_PROMPT).toContain("cannot access or edit the user's real repository");
    expect(codingModeInstruction("plan")).toContain("do not write implementation code");
    expect(mcpModeInstruction(true, true)).toContain("read-only");
  });

  it("creates a compact title from the opening message", () => {
    expect(makeConversationTitle("  how do tree roots share nutrients? ")).toBe(
      "How do tree roots share nutrients?",
    );
    expect(makeConversationTitle("x".repeat(80))).toHaveLength(46);
  });
});
