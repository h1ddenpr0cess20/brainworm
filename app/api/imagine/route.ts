import {
  buildImagineAgentTools,
  extractImagineFunctionCall,
  extractImagineSources,
  extractImagineTools,
  IMAGINE_AGENT_PROMPT,
} from "@/lib/imagineAgent";
import type { ImagineModel, MessageRole, ReasoningEffort } from "@/lib/types";
import { readUpstreamErrorMessage } from "@/lib/upstreamError";
import { missingXaiApiKeyResponse, readXaiApiKey } from "@/lib/xaiKey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODELS = new Set<ImagineModel>(["grok-imagine-image", "grok-imagine-image-quality"]);
const RATIOS = new Set([
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "2:1",
  "1:2",
  "19.5:9",
  "9:19.5",
  "20:9",
  "9:20",
  "auto",
]);

type ImagineRequest = {
  prompt?: unknown;
  model?: unknown;
  aspectRatio?: unknown;
  resolution?: unknown;
  count?: unknown;
  sourceImage?: unknown;
  webSearch?: unknown;
  reasoningEffort?: unknown;
  messages?: unknown;
};

type XaiImageItem = { b64_json?: unknown; url?: unknown; mime_type?: unknown };
type AgentMessage = { role: MessageRole; content: string };
type XaiAgentResponse = { output?: unknown[] };

export async function POST(request: Request): Promise<Response> {
  const apiKey = readXaiApiKey(request);
  if (!apiKey) return missingXaiApiKeyResponse();

  let body: ImagineRequest;
  try {
    body = (await request.json()) as ImagineRequest;
  } catch {
    return Response.json({ error: "The Imagine request is not valid JSON." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const model = MODELS.has(body.model as ImagineModel)
    ? (body.model as ImagineModel)
    : "grok-imagine-image-quality";
  const aspectRatio =
    typeof body.aspectRatio === "string" && RATIOS.has(body.aspectRatio)
      ? body.aspectRatio
      : "auto";
  const resolution = body.resolution === "2k" ? "2k" : "1k";
  const count =
    typeof body.count === "number" && Number.isFinite(body.count)
      ? Math.max(1, Math.min(2, Math.round(body.count)))
      : 1;
  const sourceImage =
    typeof body.sourceImage === "string" &&
    /^data:image\/(png|jpe?g|webp);base64,/i.test(body.sourceImage)
      ? body.sourceImage
      : null;
  const webSearch = body.webSearch === true;
  const reasoningEffort: ReasoningEffort =
    body.reasoningEffort === "low" || body.reasoningEffort === "high"
      ? body.reasoningEffort
      : "medium";
  const messages = validateMessages(body.messages);

  if (!prompt || prompt.length > 8_000) {
    return Response.json(
      { error: "An image prompt of 1–8,000 characters is required." },
      { status: 400 },
    );
  }
  if (typeof body.sourceImage === "string" && !sourceImage) {
    return Response.json(
      { error: "The source image must be a PNG, JPEG, or WebP data URL." },
      { status: 400 },
    );
  }
  if (sourceImage && sourceImage.length > 14_000_000) {
    return Response.json({ error: "The source image is too large." }, { status: 413 });
  }

  if (messages === null) {
    return Response.json({ error: "Imagine history is not valid." }, { status: 400 });
  }

  let agentResponse: Response;
  try {
    agentResponse = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.XAI_MODEL || "grok-4.5",
        input: [
          { role: "system", content: IMAGINE_AGENT_PROMPT },
          ...messages,
          { role: "user", content: prompt },
        ],
        reasoning: { effort: reasoningEffort },
        tools: buildImagineAgentTools({ edit: Boolean(sourceImage), webSearch }),
        include: webSearch ? ["web_search_call.action.sources"] : undefined,
        store: false,
      }),
      cache: "no-store",
      signal: request.signal,
    });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("xAI imagine agent request failed", error);
    return Response.json(
      { error: "Brainworm could not reach the xAI burrow. Please try again." },
      { status: 502 },
    );
  }

  if (!agentResponse.ok) {
    const error = await readUpstreamErrorMessage(agentResponse);
    return Response.json(
      { error: error || `Grok could not prepare the image request (${agentResponse.status}).` },
      { status: agentResponse.status === 429 ? 429 : 502 },
    );
  }

  const agentResult = (await agentResponse.json()) as XaiAgentResponse;
  const functionCall = extractImagineFunctionCall(agentResult.output, Boolean(sourceImage));
  const usedPrompt = functionCall?.prompt || prompt;
  const sources = extractImagineSources(agentResult.output);
  const tools = extractImagineTools(agentResult.output, functionCall);

  const payload: Record<string, unknown> = {
    model,
    prompt: usedPrompt,
    n: count,
    response_format: "b64_json",
    aspect_ratio: aspectRatio,
    resolution,
  };
  if (sourceImage) payload.image = { type: "image_url", url: sourceImage };

  let upstream: Response;
  try {
    upstream = await fetch(`https://api.x.ai/v1/images/${sourceImage ? "edits" : "generations"}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: request.signal,
    });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("xAI imagine request failed", error);
    return Response.json(
      { error: "Grok Imagine could not be reached. Please try again." },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const error = await readUpstreamErrorMessage(upstream);
    return Response.json(
      { error: error || `Grok Imagine failed (${upstream.status}).` },
      { status: upstream.status === 429 ? 429 : 502 },
    );
  }

  const result = (await upstream.json()) as { data?: XaiImageItem[] };
  const images = (
    await Promise.all((result.data ?? []).map((item) => materializeImage(item)))
  ).filter((item): item is { b64: string; mimeType: string } => item !== null);
  if (!images.length)
    return Response.json({ error: "Grok Imagine returned no embeddable images." }, { status: 502 });

  return Response.json(
    {
      images,
      model,
      aspectRatio,
      resolution,
      kind: sourceImage ? "edited" : "generated",
      usedPrompt,
      sources,
      tools,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

function validateMessages(value: unknown): AgentMessage[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 24) return null;
  let total = 0;
  const messages: AgentMessage[] = [];
  for (const message of value) {
    if (!message || typeof message !== "object") return null;
    const record = message as Record<string, unknown>;
    if (record.role !== "user" && record.role !== "assistant") return null;
    if (typeof record.content !== "string" || !record.content.trim()) return null;
    total += record.content.length;
    if (total > 60_000) return null;
    messages.push({ role: record.role, content: record.content });
  }
  return messages;
}

async function materializeImage(
  item: XaiImageItem,
): Promise<{ b64: string; mimeType: string } | null> {
  if (typeof item.b64_json === "string" && item.b64_json) {
    return {
      b64: item.b64_json,
      mimeType: typeof item.mime_type === "string" ? item.mime_type : "image/jpeg",
    };
  }
  if (typeof item.url !== "string" || !item.url.startsWith("https://")) return null;
  try {
    const response = await fetch(item.url, { cache: "no-store" });
    if (!response.ok) return null;
    const size = Number(response.headers.get("content-length") || 0);
    if (size > 20_000_000) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 20_000_000) return null;
    return {
      b64: Buffer.from(bytes).toString("base64"),
      mimeType:
        typeof item.mime_type === "string"
          ? item.mime_type
          : response.headers.get("content-type") || "image/jpeg",
    };
  } catch {
    return null;
  }
}
