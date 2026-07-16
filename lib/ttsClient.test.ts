import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SPEECH_REQUEST = {
  messageId: "message-1",
  text: "Read this reply aloud.",
  voice: "eve",
  speed: 1,
  apiKey: "xai-test-key",
};

class AudioStub {
  currentTime = 0;

  addEventListener() {}
  pause() {}
  removeAttribute() {}
  play() {
    return Promise.resolve();
  }
}

function installBrowser(cache: Cache) {
  vi.stubGlobal("window", {
    location: { origin: "https://brainworm.test" },
    setTimeout,
  });
  vi.stubGlobal("Audio", AudioStub);
  vi.stubGlobal("caches", {
    open: vi.fn().mockResolvedValue(cache),
    delete: vi.fn().mockResolvedValue(true),
  });
}

function makeCache() {
  const entries = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (request: Request) => entries.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => {
      entries.set(request.url, response.clone());
    }),
    delete: vi.fn(async (request: Request) => entries.delete(request.url)),
  };
  return cache as unknown as Cache;
}

describe("TTS audio caching", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("deduplicates generation while an identical clip is still loading", async () => {
    const cache = makeCache();
    installBrowser(cache);

    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { playTtsMessage } = await import("./ttsClient");
    const first = playTtsMessage(SPEECH_REQUEST);
    const second = playTtsMessage({ ...SPEECH_REQUEST, messageId: "message-2" });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveFetch?.(new Response(new Blob(["audio"], { type: "audio/mpeg" })));
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses a persisted clip after the playback client reloads", async () => {
    const cache = makeCache();
    installBrowser(cache);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(new Blob(["audio"], { type: "audio/mpeg" })));
    vi.stubGlobal("fetch", fetchMock);

    const firstClient = await import("./ttsClient");
    await firstClient.playTtsMessage(SPEECH_REQUEST);

    vi.resetModules();
    const reloadedClient = await import("./ttsClient");
    await reloadedClient.playTtsMessage({ ...SPEECH_REQUEST, messageId: "message-2" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
