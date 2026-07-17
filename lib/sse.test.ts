import { describe, expect, it } from "vitest";
import { parseXaiEvent, splitSseBuffer } from "./sse";

describe("xAI SSE parsing", () => {
  it("retains an incomplete event between chunks", () => {
    const result = splitSseBuffer(
      'event: response.output_text.delta\ndata: {"delta":"Hello"}\n\nevent: response.out',
    );
    expect(result.events).toEqual([
      {
        event: "response.output_text.delta",
        data: '{"delta":"Hello"}',
      },
    ]);
    expect(result.rest).toBe("event: response.out");
  });

  it("extracts response text deltas", () => {
    expect(
      parseXaiEvent({
        event: "response.output_text.delta",
        data: '{"type":"response.output_text.delta","delta":"a root"}',
      }),
    ).toEqual({ kind: "delta", delta: "a root" });
  });

  it("normalizes CRLF events and joins multiple data lines", () => {
    expect(splitSseBuffer("event: note\r\ndata: first\r\ndata: second\r\n\r\n").events).toEqual([
      { event: "note", data: "first\nsecond" },
    ]);
  });

  it("handles stream completion, malformed JSON, and unknown events", () => {
    expect(parseXaiEvent({ data: "[DONE]" })).toEqual({
      kind: "complete",
      sources: [],
      tools: [],
      items: [],
    });
    expect(parseXaiEvent({ data: "not-json" })).toBeNull();
    expect(parseXaiEvent({ data: '{"type":"response.queued"}' })).toBeNull();
  });

  it("extracts explicit and fallback upstream errors", () => {
    expect(parseXaiEvent({ event: "error", data: '{"error":{"message":"Rate limited"}}' })).toEqual(
      { kind: "error", message: "Rate limited" },
    );
    expect(parseXaiEvent({ data: '{"type":"response.failed"}' })).toEqual({
      kind: "error",
      message: "xAI could not complete the response.",
    });
  });

  it("extracts unique citation URLs from a completed response", () => {
    const output = [
      {
        content: [
          {
            annotations: [
              {
                type: "url_citation",
                title: "A field guide",
                url: "https://example.com/guide",
              },
              { type: "url_citation", title: "Duplicate", url: "https://example.com/guide" },
            ],
          },
        ],
      },
    ];
    const parsed = parseXaiEvent({
      event: "response.completed",
      data: JSON.stringify({ response: { id: "resp_1", output } }),
    });
    expect(parsed).toEqual({
      kind: "complete",
      responseId: "resp_1",
      sources: [{ title: "A field guide", url: "https://example.com/guide" }],
      tools: [],
      items: output,
    });
  });

  it("uses the citation host as a title and ignores non-http values", () => {
    const output = [{ uri: "https://www.example.org/path" }, { url: "file:///private" }, null];
    const parsed = parseXaiEvent({
      data: JSON.stringify({
        type: "response.completed",
        response: { output },
      }),
    });
    expect(parsed).toEqual({
      kind: "complete",
      sources: [{ title: "example.org", url: "https://www.example.org/path" }],
      tools: [],
      items: output.filter(Boolean),
    });
  });

  it("streams and completes MCP tool activity", () => {
    expect(
      parseXaiEvent({
        data: JSON.stringify({
          type: "response.output_item.added",
          item: { type: "mcp_call", id: "tool_1", name: "read_file", server_label: "repo" },
        }),
      }),
    ).toEqual({
      kind: "tool",
      tool: { id: "tool_1", name: "read_file", server: "repo", status: "running" },
    });

    const output = [
      {
        type: "mcp_call",
        id: "tool_1",
        name: "read_file",
        server_label: "repo",
        status: "completed",
      },
    ];
    expect(
      parseXaiEvent({
        data: JSON.stringify({
          type: "response.completed",
          response: { output },
        }),
      }),
    ).toEqual({
      kind: "complete",
      sources: [],
      tools: [{ id: "tool_1", name: "read_file", server: "repo", status: "complete" }],
      items: output,
    });
  });

  it("truncates oversized items and caps the item count before replay", () => {
    const hugeOutput = Array.from({ length: 50 }, (_, index) => ({
      type: "mcp_call",
      id: `tool_${index}`,
      output: "x".repeat(5_000),
    }));
    const parsed = parseXaiEvent({
      data: JSON.stringify({
        type: "response.completed",
        response: { output: hugeOutput },
      }),
    });
    if (parsed?.kind !== "complete") throw new Error("expected a complete event");
    expect(parsed.items).toHaveLength(40);
    expect((parsed.items[0].output as string).length).toBeLessThan(5_000);
    expect(parsed.items[0].output).toContain("…[truncated");
  });
});
