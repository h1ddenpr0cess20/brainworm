import {
  BRAINWORM_CODING_PROMPT,
  BRAINWORM_SYSTEM_PROMPT,
  codingModeInstruction,
  mcpModeInstruction,
} from "@/lib/prompt";
import { parseXaiEvent, splitSseBuffer } from "@/lib/sse";
import type {
  AppMode,
  CodeSessionMode,
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

type ChatBody = {
  messages?: IncomingMessage[];
  reasoningEffort?: ReasoningEffort;
  webSearch?: boolean;
  mode?: AppMode;
  codeSessionMode?: CodeSessionMode;
  files?: { name?: string; content?: string }[];
  mcpEnabled?: boolean;
};

const MAX_MESSAGES = 80;
const MAX_TOTAL_CHARACTERS = 200_000;
const ALLOWED_EFFORTS = new Set<ReasoningEffort>(["low", "medium", "high"]);

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Brainworm needs XAI_API_KEY in the Vercel environment." },
      { status: 503 },
    );
  }

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
    body.codeSessionMode === "plan" || body.codeSessionMode === "verify"
      ? body.codeSessionMode
      : "build";
  const files = validateFiles(body.files);
  if (files === null) {
    return Response.json(
      { error: "Code context is limited to 8 text files and 300,000 characters." },
      { status: 400 },
    );
  }
  const mcpTool = appMode === "code" && body.mcpEnabled ? buildMcpTool(codeSessionMode) : null;
  const systemPrompt =
    appMode === "code"
      ? `${BRAINWORM_CODING_PROMPT}\n\n${codingModeInstruction(codeSessionMode)}\n${mcpModeInstruction(Boolean(mcpTool), codeSessionMode !== "build")}${formatFiles(files)}`
      : BRAINWORM_SYSTEM_PROMPT;
  const tools = [
    ...(body.webSearch ? [{ type: "web_search" }] : []),
    ...(appMode === "code" ? [{ type: "code_interpreter" }] : []),
    ...(mcpTool ? [mcpTool] : []),
  ];

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
      { error: "Brainworm could not reach the xAI burrow. Please try again." },
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

      const emit = (event: StreamEvent) => {
        if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
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
            if (parsed.kind === "delta") emit({ type: "delta", delta: parsed.delta });
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
            if (parsed?.kind === "delta") emit({ type: "delta", delta: parsed.delta });
            if (parsed?.kind === "complete") {
              emit({ type: "done", responseId: parsed.responseId, sources: parsed.sources });
              finish();
              return;
            }
          }
        }
        emit({ type: "done", sources: [] });
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

type RemoteMcpTool = {
  type: "mcp";
  server_url: string;
  server_label: string;
  server_description?: string;
  allowed_tools?: string[];
  authorization?: string;
};

function buildMcpTool(mode: CodeSessionMode): RemoteMcpTool | null {
  const serverUrl = process.env.BRAINWORM_MCP_URL?.trim();
  const serverLabel = process.env.BRAINWORM_MCP_LABEL?.trim();
  if (!serverUrl || !serverLabel || !isSecureUrl(serverUrl)) return null;

  const fullTools = parseToolList(process.env.BRAINWORM_MCP_ALLOWED_TOOLS);
  const readOnlyTools = parseToolList(process.env.BRAINWORM_MCP_READONLY_TOOLS);
  const allowAll = process.env.BRAINWORM_MCP_ALLOW_ALL === "true";
  const allowedTools = mode === "build" ? fullTools : readOnlyTools;

  // xAI's Responses API does not yet support require_approval for MCP. Make
  // an explicit allowlist the default permission boundary; opting into all
  // tools requires a separate server-side environment flag.
  if (!allowedTools.length && !(mode === "build" && allowAll)) return null;

  return {
    type: "mcp",
    server_url: serverUrl,
    server_label: serverLabel.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48),
    server_description:
      process.env.BRAINWORM_MCP_DESCRIPTION?.trim() ||
      "The user's remote coding workspace and repository tools.",
    allowed_tools: allowedTools.length ? allowedTools : undefined,
    authorization: process.env.BRAINWORM_MCP_AUTHORIZATION?.trim() || undefined,
  };
}

function parseToolList(value: string | undefined): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, 64);
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

function formatFiles(files: { name: string; content: string }[]): string {
  if (!files.length) return "";
  const blocks = files.map(
    (file) => `\n<reference-file path="${file.name}">\n${file.content}\n</reference-file>`,
  );
  return `\n\nThe user supplied these read-only reference files:${blocks.join("")}`;
}

function validateMessages(value: ChatBody["messages"]): IncomingMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) return null;

  let total = 0;
  const messages: IncomingMessage[] = [];
  for (const entry of value) {
    if (!entry || (entry.role !== "user" && entry.role !== "assistant")) return null;
    if (typeof entry.content !== "string" || !entry.content.trim()) return null;
    total += entry.content.length;
    if (total > MAX_TOTAL_CHARACTERS) return null;
    messages.push({ role: entry.role, content: entry.content });
  }
  return messages;
}

async function safeUpstreamError(upstream: Response): Promise<string> {
  try {
    const payload = (await upstream.json()) as {
      error?: { message?: string } | string;
      message?: string;
    };
    const message =
      typeof payload.error === "string"
        ? payload.error
        : (payload.error?.message ?? payload.message);
    if (message) return `xAI: ${message}`;
  } catch {
    // Fall through to the status-based message.
  }
  return `xAI returned ${upstream.status} ${upstream.statusText || "an error"}.`;
}
