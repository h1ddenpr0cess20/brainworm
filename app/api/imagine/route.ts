import type { ImagineModel } from "@/lib/types";
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
};

type XaiImageItem = { b64_json?: unknown; url?: unknown; mime_type?: unknown };

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

  const payload: Record<string, unknown> = {
    model,
    prompt,
    n: count,
    response_format: "b64_json",
    aspect_ratio: aspectRatio,
    resolution,
  };
  if (sourceImage) payload.image = { type: "image_url", url: sourceImage };

  const upstream = await fetch(
    `https://api.x.ai/v1/images/${sourceImage ? "edits" : "generations"}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );

  if (!upstream.ok) {
    const error = await readError(upstream);
    return Response.json(
      { error: error || `Grok Imagine failed (${upstream.status}).` },
      { status: upstream.status === 429 ? 429 : 502 },
    );
  }

  const result = (await upstream.json()) as { data?: XaiImageItem[] };
  const images = (result.data ?? []).flatMap((item) => {
    if (typeof item.b64_json !== "string" || !item.b64_json) return [];
    return [
      {
        b64: item.b64_json,
        mimeType: typeof item.mime_type === "string" ? item.mime_type : "image/jpeg",
      },
    ];
  });
  if (!images.length)
    return Response.json({ error: "Grok Imagine returned no embeddable images." }, { status: 502 });

  return Response.json(
    { images, model, aspectRatio, resolution, kind: sourceImage ? "edited" : "generated" },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof payload.error === "string") return payload.error;
    return payload.error?.message || payload.message || "";
  } catch {
    return "";
  }
}
