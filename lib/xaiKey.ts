const MAX_API_KEY_LENGTH = 512;

export function readXaiApiKey(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer[ \t]+(.+)$/i);
  const apiKey = match?.[1]?.trim();

  if (!apiKey || apiKey.length > MAX_API_KEY_LENGTH || /[\u0000-\u001f\u007f]/.test(apiKey)) {
    return null;
  }

  return apiKey;
}

export function missingXaiApiKeyResponse(): Response {
  return Response.json({ error: "Add your xAI API key in Settings → Model." }, { status: 401 });
}
