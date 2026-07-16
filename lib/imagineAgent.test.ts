import { describe, expect, it } from "vitest";
import {
  buildImagineAgentTools,
  extractImagineFunctionCall,
  extractImagineSources,
  extractImagineTools,
  IMAGINE_AGENT_PROMPT,
} from "./imagineAgent";

describe("Wordmark-style Imagine orchestration", () => {
  it("offers search tools and the correct client-side image function", () => {
    const tools = buildImagineAgentTools({ edit: false, webSearch: true });
    expect(tools.map((tool) => tool.type)).toEqual(["web_search", "x_search", "function"]);
    expect(tools[2]).toMatchObject({ name: "grok_generate_image" });
    expect(IMAGINE_AGENT_PROMPT).toContain("use them first");

    const editTools = buildImagineAgentTools({ edit: true, webSearch: false });
    expect(editTools).toHaveLength(1);
    expect(editTools[0]).toMatchObject({ name: "grok_edit_image" });
  });

  it("extracts the grounded prompt from the requested image function", () => {
    const output = [
      {
        type: "function_call",
        call_id: "call_1",
        name: "grok_generate_image",
        arguments: JSON.stringify({ prompt: "A current, researched city skyline" }),
      },
    ];
    expect(extractImagineFunctionCall(output, false)).toEqual({
      id: "call_1",
      name: "grok_generate_image",
      prompt: "A current, researched city skyline",
    });
    expect(extractImagineFunctionCall(output, true)).toBeNull();
  });

  it("collects search sources and visible tool activity", () => {
    const output = [
      {
        type: "web_search_call",
        id: "search_1",
        status: "completed",
        action: {
          sources: [{ title: "Official reference", url: "https://example.com/reference" }],
        },
      },
    ];
    expect(extractImagineSources(output)).toEqual([
      { title: "Official reference", url: "https://example.com/reference" },
    ]);
    expect(extractImagineTools(output, null)).toEqual([
      { id: "search_1", name: "Web search", status: "complete" },
    ]);
  });
});
