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

  it("tells the model to skip web search when it already has the context", () => {
    expect(BRAINWORM_SYSTEM_PROMPT).toContain("Use web search sparingly");
    expect(BRAINWORM_SYSTEM_PROMPT).toContain(
      "do not re-search facts you have already gathered this conversation",
    );
  });

  it("keeps plan mode read-only and explicit about browser limitations", () => {
    expect(BRAINWORM_CODING_PROMPT).toContain("cannot access or edit the user's real repository");
    expect(codingModeInstruction("plan")).toContain("make no workspace changes");
    expect(mcpModeInstruction(1, true)).toContain("read-only");
  });

  it("returns distinct instructions for every coding mode", () => {
    expect(codingModeInstruction("normal")).toContain("NORMAL");
    expect(codingModeInstruction("always")).toContain("authorized");
  });

  it("describes unavailable, read-only, and armed MCP states", () => {
    expect(mcpModeInstruction(0, false)).toContain("No workspace MCP");
    expect(mcpModeInstruction(1, true)).toContain("read-only");
    expect(mcpModeInstruction(2, false)).toContain("2 workspace MCP servers");
  });

  it("keeps product provenance and UI commands out of runtime instructions", () => {
    expect(BRAINWORM_CODING_PROMPT).not.toContain("Grok Build");
    expect(BRAINWORM_CODING_PROMPT).not.toContain("Slash command");
  });

  it("creates a compact title from the opening message", () => {
    expect(makeConversationTitle("  how do tree roots share nutrients? ")).toBe(
      "How do tree roots share nutrients?",
    );
    expect(makeConversationTitle("x".repeat(80))).toHaveLength(46);
    expect(makeConversationTitle("   ")).toBe("Fresh burrow");
  });
});
