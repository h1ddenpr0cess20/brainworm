import {
  BRAINWORM_CODING_PROMPT,
  BRAINWORM_SYSTEM_PROMPT,
  codingModeInstruction,
  mcpModeInstruction,
} from "@/lib/prompt";
import { parseXaiEvent, splitSseBuffer } from "@/lib/sse";
import { readUpstreamErrorMessage } from "@/lib/upstreamError";
import { missingXaiApiKeyResponse, readXaiApiKey } from "@/lib/xaiKey";
import type {
  AppMode,
  CodeSessionMode,
  McpServerConfig,
  MessageRole,
  ReasoningEffort,
  StreamEvent,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type IncomingMessage = {
  role: MessageRole;
  content: string;
};

/**
 * A prior-turn item echoed back verbatim (mcp_call, reasoning, message, …)
 * so the model keeps memory of earlier tool activity across turns without
 * server-side conversation storage. Shape is whatever xAI last sent us.
 */
type IncomingResponseItem = Record<string, unknown>;

type ChatBody = {
  messages?: (IncomingMessage | IncomingResponseItem)[];
  reasoningEffort?: ReasoningEffort;
  webSearch?: boolean;
  mode?: AppMode;
  codeSessionMode?: CodeSessionMode;
  files?: { name?: string; content?: string }[];
  mcpServers?: McpServerConfig[];
  projectBrief?: string;
};

const MAX_MESSAGES = 240;
const MAX_TOTAL_CHARACTERS = 400_000;
const ALLOWED_EFFORTS = new Set<ReasoningEffort>(["low", "medium", "high"]);

export async function POST(request: Request): Promise<Response> {
  const apiKey = readXaiApiKey(request);
  if (!apiKey) return missingXaiApiKeyResponse();

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return Response.json({ error: "That request was not valid JSON." }, { status: 400 });
  }

  const messages = validateMessages(body.messages);
  if (!messages) {
    return Response.json(
      { error: "Messages must contain non-empty user and assistant text." },
      { status: 400 },
    );
  }

  const reasoningEffort = ALLOWED_EFFORTS.has(body.reasoningEffort ?? "medium")
    ? (body.reasoningEffort ?? "medium")
    : "medium";
  const appMode: AppMode = body.mode === "code" ? "code" : "chat";
  const codeSessionMode: CodeSessionMode =
    body.codeSessionMode === "plan" || body.codeSessionMode === "always"
      ? body.codeSessionMode
      : "normal";
  const files = validateFiles(body.files);
  if (files === null) {
    return Response.json(
      { error: "Code context is limited to 8 text files and 300,000 characters." },
      { status: 400 },
    );
  }
  const mcpTools = appMode === "code" ? buildMcpTools(body.mcpServers, codeSessionMode) : [];
  const projectBrief =
    appMode === "code" && typeof body.projectBrief === "string"
      ? body.projectBrief.trim().slice(0, 4_000)
      : "";
  const systemPrompt =
    appMode === "code"
      ? `${BRAINWORM_CODING_PROMPT}\n\n${codingModeInstruction(codeSessionMode)}\n${mcpModeInstruction(mcpTools.length, codeSessionMode !== "always")}${formatProjectBrief(projectBrief)}${formatFiles(files)}`
      : BRAINWORM_SYSTEM_PROMPT;
  const tools = [...(body.webSearch ? [{ type: "web_search" }] : []), ...mcpTools];

  let upstream: Response;
  try {
    upstream = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: process.env.XAI_MODEL || "grok-4.5",
        input: [{ role: "system", content: systemPrompt }, ...messages],
        reasoning: { effort: reasoningEffort },
        tools: tools.length ? tools : undefined,
        stream: true,
        store: false,
      }),
      signal: request.signal,
    });
  } catch (error) {
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    console.error("xAI request failed", error);
    return Response.json(
      { error: "Brainworm could not reach xAI. Please try again." },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await safeUpstreamError(upstream);
    return Response.json({ error: detail }, { status: upstream.status || 502 });
  }

  const reader = upstream.body.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      let closed = false;
      let pendingParagraphBreak = false;

      const emit = (event: StreamEvent) => {
        if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const emitDelta = (delta: string) => {
        emit({ type: "delta", delta: pendingParagraphBreak ? `\n\n${delta}` : delta });
        pendingParagraphBreak = false;
      };
      const finish = () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const split = splitSseBuffer(buffer);
          buffer = split.rest;

          for (const sseEvent of split.events) {
            const parsed = parseXaiEvent(sseEvent);
            if (!parsed) continue;
            if (parsed.kind === "delta") emitDelta(parsed.delta);
            if (parsed.kind === "tool") {
              pendingParagraphBreak = true;
              emit({ type: "tool", tool: parsed.tool });
            }
            if (parsed.kind === "error") {
              emit({ type: "error", message: parsed.message });
              finish();
              return;
            }
            if (parsed.kind === "complete") {
              emit({
                type: "done",
                responseId: parsed.responseId,
                sources: parsed.sources,
                tools: parsed.tools,
                items: parsed.items,
              });
              finish();
              return;
            }
          }
        }

        buffer += decoder.decode();
        if (buffer.trim()) {
          const split = splitSseBuffer(`${buffer}\n\n`);
          for (const sseEvent of split.events) {
            const parsed = parseXaiEvent(sseEvent);
            if (parsed?.kind === "delta") emitDelta(parsed.delta);
            if (parsed?.kind === "tool") {
              pendingParagraphBreak = true;
              emit({ type: "tool", tool: parsed.tool });
            }
            if (parsed?.kind === "complete") {
              emit({
                type: "done",
                responseId: parsed.responseId,
                sources: parsed.sources,
                tools: parsed.tools,
                items: parsed.items,
              });
              finish();
              return;
            }
          }
        }
        emit({ type: "done", sources: [], tools: [], items: [] });
        finish();
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("xAI stream failed", error);
          emit({ type: "error", message: "The response stream ended unexpectedly." });
        }
        finish();
      } finally {
        reader.releaseLock();
      }
    },
    cancel() {
      void reader.cancel();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export type RemoteMcpTool = {
  type: "mcp";
  server_url: string;
  server_label: string;
  server_description?: string;
  allowed_tools?: string[];
  authorization?: string;
};

export function buildMcpTools(
  value: ChatBody["mcpServers"],
  mode: CodeSessionMode,
): RemoteMcpTool[] {
  if (!Array.isArray(value)) return [];
  const seenLabels = new Set<string>();
  const tools: RemoteMcpTool[] = [];
  // Filter before capping so disabled entries cannot crowd enabled ones out
  // of the eight available slots.
  const enabled = value.filter((server) => server && server.enabled === true).slice(0, 8);
  for (const server of enabled) {
    const serverUrl = typeof server.url === "string" ? server.url.trim() : "";
    const rawLabel = typeof server.label === "string" ? server.label.trim() : "";
    const serverLabel = rawLabel.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
    if (!serverUrl || !serverLabel || seenLabels.has(serverLabel) || !isSecureUrl(serverUrl))
      continue;
    const sourceTools = mode === "always" ? server.allowedTools : server.readOnlyTools;
    const allowedTools = Array.isArray(sourceTools)
      ? [
          ...new Set(
            sourceTools
              .filter((item) => typeof item === "string")
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        ].slice(0, 64)
      : [];
    // Never expose an unbounded MCP server. Empty allowlists disable it for
    // that mode instead of silently granting every tool the server advertises.
    if (!allowedTools.length) continue;
    seenLabels.add(serverLabel);
    tools.push({
      type: "mcp",
      server_url: serverUrl,
      server_label: serverLabel,
      server_description:
        typeof server.description === "string" && server.description.trim()
          ? server.description.trim().slice(0, 500)
          : "A user-configured coding workspace.",
      allowed_tools: allowedTools,
      authorization:
        typeof server.authorization === "string" && server.authorization.trim()
          ? server.authorization.trim().slice(0, 4096)
          : undefined,
    });
  }
  return tools;
}

function isSecureUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validateFiles(value: ChatBody["files"]): { name: string; content: string }[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) return null;
  let total = 0;
  const files: { name: string; content: string }[] = [];
  for (const file of value) {
    if (!file || typeof file.name !== "string" || typeof file.content !== "string") return null;
    const name = file.name.replace(/[<>"']/g, "").slice(0, 180);
    if (!name || file.content.length > 100_000) return null;
    total += file.content.length;
    if (total > 300_000) return null;
    files.push({ name, content: file.content });
  }
  return files;
}

function formatProjectBrief(brief: string): string {
  if (!brief) return "";
  return `\n\nProject brief supplied by the user (standing orientation, not a task):\n${brief}`;
}

function formatFiles(files: { name: string; content: string }[]): string {
  if (!files.length) return "";
  const blocks = files.map(
    (file) => `\n<reference-file path="${file.name}">\n${file.content}\n</reference-file>`,
  );
  return `\n\nThe user supplied these read-only reference files:${blocks.join("")}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Accepts either a simple {role, content} turn or a raw item echoed back from
 * a previous response (mcp_call, reasoning, message, …), which is how
 * tool-call context survives across turns without server-side storage. Role
 * is constrained so a simple turn can never smuggle in a system/developer
 * instruction.
 */
export function validateMessages(
  value: ChatBody["messages"],
): (IncomingMessage | IncomingResponseItem)[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) return null;

  let total = 0;
  let hasUserText = false;
  const messages: (IncomingMessage | IncomingResponseItem)[] = [];
  for (const raw of value) {
    if (!isPlainObject(raw)) return null;
    const entry: Record<string, unknown> = raw;
    const role = entry.role;
    if (role === "user" || role === "assistant") {
      const content = entry.content;
      if (typeof content !== "string" || !content.trim()) return null;
      total += content.length;
      if (role === "user") hasUserText = true;
      messages.push({ role, content });
    } else {
      if (role !== undefined || typeof entry.type !== "string") return null;
      total += JSON.stringify(entry).length;
      messages.push(entry as IncomingResponseItem);
    }
    if (total > MAX_TOTAL_CHARACTERS) return null;
  }
  if (!hasUserText) return null;
  return messages;
}

async function safeUpstreamError(upstream: Response): Promise<string> {
  const message = await readUpstreamErrorMessage(upstream);
  if (message) return `xAI: ${message}`;
  return `xAI returned ${upstream.status} ${upstream.statusText || "an error"}.`;
}
