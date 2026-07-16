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

  it("extracts unique citation URLs from a completed response", () => {
    const parsed = parseXaiEvent({
      event: "response.completed",
      data: JSON.stringify({
        response: {
          id: "resp_1",
          output: [
            {
              content: [
                {
                  annotations: [
                    { type: "url_citation", title: "A field guide", url: "https://example.com/guide" },
                    { type: "url_citation", title: "Duplicate", url: "https://example.com/guide" },
                  ],
                },
              ],
            },
          ],
        },
      }),
    });
    expect(parsed).toEqual({
      kind: "complete",
      responseId: "resp_1",
      sources: [{ title: "A field guide", url: "https://example.com/guide" }],
    });
  });
});
