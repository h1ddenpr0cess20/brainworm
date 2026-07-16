import type { Source, ToolActivity } from "./types";

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
  item?: unknown;
  error?: {
    message?: string;
  };
};

export function parseXaiEvent(
  event: SseEvent,
):
  | { kind: "delta"; delta: string }
  | { kind: "tool"; tool: ToolActivity }
  | { kind: "complete"; responseId?: string; sources: Source[]; tools: ToolActivity[] }
  | { kind: "error"; message: string }
  | null {
  if (event.data === "[DONE]") return { kind: "complete", sources: [], tools: [] };

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
  if (type === "response.output_item.added") {
    const tool = parseToolActivity(payload.item, "running");
    return tool ? { kind: "tool", tool } : null;
  }
  if (type === "response.completed") {
    return {
      kind: "complete",
      responseId: payload.response?.id,
      sources: extractSources(payload.response?.output),
      tools: extractToolActivities(payload.response?.output),
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

function parseToolActivity(
  value: unknown,
  fallbackStatus: ToolActivity["status"],
): ToolActivity | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  if (!type.includes("call") || type === "function_call") return null;
  const id =
    typeof record.id === "string"
      ? record.id
      : typeof record.call_id === "string"
        ? record.call_id
        : `${type}:${String(record.name ?? record.server_label ?? "tool")}`;
  const name =
    typeof record.name === "string"
      ? record.name
      : type === "web_search_call"
        ? "Web search"
        : type.replace(/_/g, " ");
  const rawStatus = typeof record.status === "string" ? record.status : "";
  const status: ToolActivity["status"] =
    rawStatus === "failed" || rawStatus === "error"
      ? "error"
      : rawStatus === "completed"
        ? "complete"
        : fallbackStatus;
  return {
    id,
    name,
    server: typeof record.server_label === "string" ? record.server_label : undefined,
    status,
  };
}

function extractToolActivities(output: unknown[] | undefined): ToolActivity[] {
  if (!Array.isArray(output)) return [];
  const tools = new Map<string, ToolActivity>();
  for (const item of output) {
    const tool = parseToolActivity(item, "complete");
    if (tool) tools.set(tool.id, tool);
  }
  return [...tools.values()];
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
