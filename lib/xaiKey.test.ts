import { describe, expect, it } from "vitest";
import { missingXaiApiKeyResponse, readXaiApiKey } from "./xaiKey";

describe("readXaiApiKey", () => {
  it("reads a bearer token supplied by the user", () => {
    const request = new Request("https://brainworm.test/api/chat", {
      headers: { Authorization: "Bearer xai-user-key" },
    });

    expect(readXaiApiKey(request)).toBe("xai-user-key");
  });

  it("accepts case-insensitive bearer authentication and trims the key", () => {
    const request = new Request("https://brainworm.test/api/chat", {
      headers: { Authorization: "bearer   xai-user-key   " },
    });

    expect(readXaiApiKey(request)).toBe("xai-user-key");
  });

  it("rejects missing, malformed, and oversized credentials", () => {
    expect(readXaiApiKey(new Request("https://brainworm.test/api/chat"))).toBeNull();
    expect(
      readXaiApiKey(
        new Request("https://brainworm.test/api/chat", {
          headers: { Authorization: "Basic abc" },
        }),
      ),
    ).toBeNull();
    expect(
      readXaiApiKey(
        new Request("https://brainworm.test/api/chat", {
          headers: { Authorization: `Bearer ${"x".repeat(513)}` },
        }),
      ),
    ).toBeNull();
  });
});

describe("missingXaiApiKeyResponse", () => {
  it("returns a useful authentication error", async () => {
    const response = missingXaiApiKeyResponse();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Add your xAI API key in Settings → Model.",
    });
  });
});
