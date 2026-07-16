/** Reads the human-readable message from an xAI JSON error payload, or "" if there is none. */
export async function readUpstreamErrorMessage(response: Response): Promise<string> {
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
