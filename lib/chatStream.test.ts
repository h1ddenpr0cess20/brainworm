import { describe, expect, it } from "vitest";
import { readStreamEvents } from "./chatStream";
import type { StreamEvent } from "./types";

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of readStreamEvents(body)) events.push(event);
  return events;
}

describe("chat stream reading", () => {
  it("parses events split across chunk boundaries", async () => {
    const events = await collect(
      streamOf('{"type":"delta","del', 'ta":"Hi"}\n{"type":"done","sources":[],"tools":[]}\n'),
    );
    expect(events).toEqual([
      { type: "delta", delta: "Hi" },
      { type: "done", sources: [], tools: [] },
    ]);
  });

  it("keeps a final event that has no trailing newline", async () => {
    const events = await collect(streamOf('{"type":"delta","delta":"tail"}'));
    expect(events).toEqual([{ type: "delta", delta: "tail" }]);
  });

  it("skips blank lines", async () => {
    const events = await collect(streamOf('\n\n{"type":"delta","delta":"a"}\n\n'));
    expect(events).toEqual([{ type: "delta", delta: "a" }]);
  });
});
