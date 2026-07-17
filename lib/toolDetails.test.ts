import { describe, expect, it } from "vitest";
import type { ToolActivity } from "./types";
import { describeToolActivity, findResponseItem } from "./toolDetails";

const tool: ToolActivity = { id: "tool-1", name: "read_file", server: "repo", status: "complete" };

describe("findResponseItem", () => {
  it("matches by id or call_id", () => {
    const items = [{ type: "mcp_call", call_id: "tool-1", output: "hi" }];
    expect(findResponseItem(items, "tool-1")).toBe(items[0]);
    expect(findResponseItem(items, "missing")).toBeUndefined();
    expect(findResponseItem(undefined, "tool-1")).toBeUndefined();
  });
});

describe("describeToolActivity", () => {
  it("falls back to name and status when no raw item was captured", () => {
    expect(describeToolActivity(tool, undefined)).toBe("read_file · complete");
  });

  it("includes stringified arguments and output", () => {
    const detail = describeToolActivity(tool, {
      arguments: { path: "config.ts" },
      output: "export const timeout = 300;",
    });
    expect(detail).toContain('Arguments: {"path":"config.ts"}');
    expect(detail).toContain("Output: export const timeout = 300;");
  });

  it("prefers a web search action's query and reports errors", () => {
    const detail = describeToolActivity(
      { ...tool, name: "Web search" },
      { action: { type: "search", query: "xAI Responses API" }, error: "rate limited" },
    );
    expect(detail).toContain("Query: xAI Responses API");
    expect(detail).toContain("Error: rate limited");
  });

  it("truncates oversized fields", () => {
    const detail = describeToolActivity(tool, { output: "x".repeat(1000) });
    expect(detail).toContain("…");
    expect(detail.length).toBeLessThan(1000);
  });
});
