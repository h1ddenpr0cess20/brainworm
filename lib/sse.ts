import type { Source } from "./types";

export type SseEvent = {
  event?: string;
  data: string;
};

export function splitSseBuffer(buffer: string): {
  events: SseEvent[];
  rest: string;
} {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events = blocks
    .map((block) => {
      let event: string | undefined;
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      return { event, data: data.join("\n") };
    })
    .filter((entry) => entry.data.length > 0);

  return { events, rest };
}

type XaiEventPayload = {
  type?: string;
  delta?: string;
  response?: {
    id?: string;
    output?: unknown[];
  };
  error?: {
    message?: string;
  };
};

export function parseXaiEvent(
  event: SseEvent,
):
  | { kind: "delta"; delta: string }
  | { kind: "complete"; responseId?: string; sources: Source[] }
  | { kind: "error"; message: string }
  | null {
  if (event.data === "[DONE]") return { kind: "complete", sources: [] };

  let payload: XaiEventPayload;
  try {
    payload = JSON.parse(event.data) as XaiEventPayload;
  } catch {
    return null;
  }

  const type = event.event ?? payload.type;
  if (type === "response.output_text.delta" && typeof payload.delta === "string") {
    return { kind: "delta", delta: payload.delta };
  }
  if (type === "response.completed") {
    return {
      kind: "complete",
      responseId: payload.response?.id,
      sources: extractSources(payload.response?.output),
    };
  }
  if (type === "error" || type === "response.failed") {
    return {
      kind: "error",
      message: payload.error?.message ?? "xAI could not complete the response.",
    };
  }

  return null;
}

function extractSources(output: unknown[] | undefined): Source[] {
  if (!Array.isArray(output)) return [];
  const sources = new Map<string, Source>();

  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const url =
      typeof record.url === "string"
        ? record.url
        : typeof record.uri === "string"
          ? record.uri
          : null;
    if (url && /^https?:\/\//.test(url)) {
      const title =
        typeof record.title === "string" && record.title.trim()
          ? record.title.trim()
          : new URL(url).hostname.replace(/^www\./, "");
      if (!sources.has(url)) sources.set(url, { title, url });
    }
    for (const child of Object.values(record)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  };

  output.forEach(visit);
  return [...sources.values()].slice(0, 12);
}
