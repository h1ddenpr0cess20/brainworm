import { isTtsSpeed } from "@/lib/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type TtsRequest = {
  text?: unknown;
  voice?: unknown;
  speed?: unknown;
};

const VOICE_ID_PATTERN = /^[a-z0-9_-]{1,128}$/i;

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "XAI_API_KEY is not configured." }, { status: 503 });
  }

  let body: TtsRequest;
  try {
    body = (await request.json()) as TtsRequest;
  } catch {
    return Response.json({ error: "The speech request is not valid JSON." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const voice = typeof body.voice === "string" ? body.voice.trim() : "eve";
  const speed = typeof body.speed === "number" ? body.speed : 1;

  if (!text || text.length > 15_000) {
    return Response.json(
      { error: "Speech text must contain 1–15,000 characters." },
      { status: 400 },
    );
  }
  if (!VOICE_ID_PATTERN.test(voice)) {
    return Response.json({ error: "The voice ID is invalid." }, { status: 400 });
  }
  if (!isTtsSpeed(speed)) {
    return Response.json({ error: "Speech speed must be between 0.7 and 1.5." }, { status: 400 });
  }

  const upstream = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice_id: voice,
      language: "auto",
      output_format: {
        codec: "mp3",
        sample_rate: 24_000,
        bit_rate: 128_000,
      },
      speed,
      text_normalization: true,
    }),
    cache: "no-store",
  });

  if (!upstream.ok) {
    const detail = await readUpstreamError(upstream);
    return Response.json(
      { error: detail || `xAI speech synthesis failed (${upstream.status}).` },
      { status: upstream.status === 429 ? 429 : 502 },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readUpstreamError(response: Response): Promise<string> {
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
