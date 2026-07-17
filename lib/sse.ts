import { collectHttpSources } from "./sources";
import type { ResponseItem, Source, ToolActivity } from "./types";

const MAX_REPLAYED_ITEMS = 40;
const MAX_ITEM_STRING = 4_000;

/**
 * Caps what is kept from a completed response's raw output before it is
 * persisted and echoed back on a later turn, so unbounded tool output (e.g.
 * a large file read) can't bloat every subsequent request forever.
 */
function truncateStrings(value: unknown, depth = 0): unknown {
  if (depth > 6) return null;
  if (typeof value === "string") {
    return value.length > MAX_ITEM_STRING
      ? `${value.slice(0, MAX_ITEM_STRING)}…[truncated ${value.length - MAX_ITEM_STRING} chars]`
      : value;
  }
  if (Array.isArray(value))
    return value.slice(0, 50).map((entry) => truncateStrings(entry, depth + 1));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = truncateStrings(val, depth + 1);
    }
    return result;
  }
  return value;
}

export function sanitizeResponseItems(output: unknown[] | undefined): ResponseItem[] {
  if (!Array.isArray(output)) return [];
  return output
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .slice(0, MAX_REPLAYED_ITEMS)
    .map((item) => truncateStrings(item) as ResponseItem);
}

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

export function parseXaiEvent(event: SseEvent):
  | { kind: "delta"; delta: string }
  | { kind: "tool"; tool: ToolActivity }
  | {
      kind: "complete";
      responseId?: string;
      sources: Source[];
      tools: ToolActivity[];
      items: ResponseItem[];
    }
  | { kind: "error"; message: string }
  | null {
  if (event.data === "[DONE]") return { kind: "complete", sources: [], tools: [], items: [] };

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
      sources: collectHttpSources(payload.response?.output),
      tools: extractToolActivities(payload.response?.output),
      items: sanitizeResponseItems(payload.response?.output),
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
