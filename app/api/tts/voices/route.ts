import type { TtsVoice } from "@/lib/types";

export const dynamic = "force-dynamic";

type XaiVoice = {
  voice_id?: unknown;
  name?: unknown;
  description?: unknown;
};

export async function GET(): Promise<Response> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "XAI_API_KEY is not configured." }, { status: 503 });
  }

  const upstream = await fetch("https://api.x.ai/v1/tts/voices", {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  if (!upstream.ok) {
    return Response.json({ error: "The xAI voice catalog is unavailable." }, { status: 502 });
  }

  const payload = (await upstream.json()) as { voices?: XaiVoice[] };
  const voices: TtsVoice[] = (payload.voices ?? [])
    .filter((voice) => typeof voice.voice_id === "string" && typeof voice.name === "string")
    .map((voice) => ({
      voiceId: voice.voice_id as string,
      name: voice.name as string,
      ...(typeof voice.description === "string" ? { description: voice.description } : {}),
    }));

  return Response.json({ voices }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
