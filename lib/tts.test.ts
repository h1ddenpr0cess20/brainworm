import { describe, expect, it } from "vitest";
import { isTtsSpeed, isTtsActive, toSpeechText } from "./tts";

describe("isTtsActive", () => {
  it("allows voice in Chat and Imagine when TTS is enabled", () => {
    expect(isTtsActive({ appMode: "chat", ttsEnabled: true })).toBe(true);
    expect(isTtsActive({ appMode: "imagine", ttsEnabled: true })).toBe(true);
  });

  it("never allows voice in Code mode, even with TTS enabled", () => {
    expect(isTtsActive({ appMode: "code", ttsEnabled: true })).toBe(false);
    expect(isTtsActive({ appMode: "code", ttsEnabled: false })).toBe(false);
  });

  it("stays off when TTS is disabled", () => {
    expect(isTtsActive({ appMode: "chat", ttsEnabled: false })).toBe(false);
  });
});

describe("toSpeechText", () => {
  it("removes fenced code and Markdown decoration", () => {
    expect(toSpeechText("## Root\nRead **this**.\n```ts\nconst x = 1\n```")).toBe(
      "Root Read this.",
    );
  });

  it("keeps link labels but removes URLs", () => {
    expect(toSpeechText("See [the notes](https://example.com) or https://x.ai.")).toBe(
      "See the notes or",
    );
  });

  it("flattens quotes, lists, images, inline code, and tables", () => {
    expect(toSpeechText("> Note\n- one\n2. two\n![diagram](image.png) `code` | cell |")).toBe(
      "Note one two diagram code , cell ,",
    );
  });

  it("caps provider input at 15,000 characters", () => {
    expect(toSpeechText("x".repeat(20_000))).toHaveLength(15_000);
  });
});

describe("isTtsSpeed", () => {
  it("accepts xAI's documented range", () => {
    expect(isTtsSpeed(0.7)).toBe(true);
    expect(isTtsSpeed(1.5)).toBe(true);
    expect(isTtsSpeed(1.6)).toBe(false);
    expect(isTtsSpeed(0.69)).toBe(false);
    expect(isTtsSpeed(Number.NaN)).toBe(false);
  });
});
