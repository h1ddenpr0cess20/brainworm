import { describe, expect, it } from "vitest";
import { isTtsSpeed, toSpeechText } from "./tts";

describe("toSpeechText", () => {
  it("removes fenced code and Markdown decoration", () => {
    expect(toSpeechText("## Root\nRead **this**.\n```ts\nconst x = 1\n```"))
      .toBe("Root Read this.");
  });

  it("keeps link labels but removes URLs", () => {
    expect(toSpeechText("See [the notes](https://example.com) or https://x.ai."))
      .toBe("See the notes or");
  });
});

describe("isTtsSpeed", () => {
  it("accepts xAI's documented range", () => {
    expect(isTtsSpeed(0.7)).toBe(true);
    expect(isTtsSpeed(1.5)).toBe(true);
    expect(isTtsSpeed(1.6)).toBe(false);
  });
});
