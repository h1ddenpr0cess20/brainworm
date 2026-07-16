import { describe, expect, it } from "vitest";
import { parseCodeCommand } from "./codeCommands";

describe("Code slash commands", () => {
  it("does not capture normal prompts", () => {
    expect(parseCodeCommand("fix the tests", "normal", false)).toBeNull();
  });

  it("parses mode commands and keeps an inline task", () => {
    expect(parseCodeCommand("/plan add auth", "normal", false)).toEqual({
      type: "mode",
      mode: "plan",
      prompt: "add auth",
    });
    expect(parseCodeCommand("/always-approve", "normal", false)).toEqual({
      type: "mode",
      mode: "always",
      prompt: "",
    });
    expect(parseCodeCommand("/always-approve", "always", false)).toEqual({
      type: "mode",
      mode: "normal",
      prompt: "",
    });
  });

  it("parses settings commands without sending them to the model", () => {
    expect(parseCodeCommand("/search on", "normal", false)).toEqual({
      type: "search",
      enabled: true,
    });
    expect(parseCodeCommand("/effort high", "normal", false)).toEqual({
      type: "effort",
      effort: "high",
    });
    expect(parseCodeCommand("/mcp", "normal", false)).toEqual({ type: "mcp" });
    expect(parseCodeCommand("/new", "normal", false)).toEqual({ type: "new" });
  });

  it("keeps the inline task verbatim, including line breaks", () => {
    expect(parseCodeCommand("/plan add auth\n- login\n- logout", "normal", false)).toEqual({
      type: "mode",
      mode: "plan",
      prompt: "add auth\n- login\n- logout",
    });
  });

  it("captures unknown slash commands instead of treating them as prompts", () => {
    expect(parseCodeCommand("/wat", "normal", false)).toEqual({
      type: "unknown",
      command: "/wat",
    });
  });
});
