import { describe, expect, it } from "vitest";
import { collectGalleryItems, imageExtension, imageFileName, imageMeta } from "./gallery";
import type { Conversation, GeneratedImageRef } from "./types";

function makeImage(overrides: Partial<GeneratedImageRef> = {}): GeneratedImageRef {
  return {
    id: "image-1",
    prompt: "a worm reading a book",
    mimeType: "image/png",
    model: "grok-imagine-image",
    aspectRatio: "1:1",
    resolution: "1k",
    kind: "generated",
    createdAt: 1,
    ...overrides,
  };
}

function makeConversation(
  id: string,
  title: string,
  images: GeneratedImageRef[][],
): Conversation {
  return {
    id,
    title,
    createdAt: 0,
    updatedAt: 0,
    messages: images.map((group, index) => ({
      id: `${id}-message-${index}`,
      role: "assistant" as const,
      content: "",
      createdAt: 0,
      status: "complete" as const,
      images: group,
    })),
  };
}

describe("collectGalleryItems", () => {
  it("gathers images from every thread, newest first", () => {
    const conversations = [
      makeConversation("c1", "First burrow", [
        [makeImage({ id: "a", createdAt: 10 })],
        [makeImage({ id: "b", createdAt: 30 })],
      ]),
      makeConversation("c2", "Second burrow", [[makeImage({ id: "c", createdAt: 20 })]]),
    ];

    const items = collectGalleryItems(conversations);

    expect(items.map((item) => item.image.id)).toEqual(["b", "c", "a"]);
    expect(items[1].conversationId).toBe("c2");
    expect(items[1].conversationTitle).toBe("Second burrow");
  });

  it("ignores messages without images", () => {
    const conversation = makeConversation("c1", "Empty", []);
    conversation.messages = [
      { id: "m1", role: "user", content: "hi", createdAt: 0, status: "complete" },
    ];

    expect(collectGalleryItems([conversation])).toEqual([]);
  });
});

describe("imageFileName", () => {
  it("slugifies the prompt", () => {
    expect(imageFileName(makeImage())).toBe("brainworm-a-worm-reading-a-book.png");
  });

  it("drops punctuation and caps long prompts", () => {
    const name = imageFileName(makeImage({ prompt: "Wow! ".repeat(30) }));
    expect(name).toBe(`brainworm-${"wow-".repeat(14)}wow.png`);
  });

  it("falls back to the kind when the prompt has nothing usable", () => {
    expect(imageFileName(makeImage({ prompt: "!!!", kind: "edited" }))).toBe(
      "brainworm-edited.png",
    );
  });

  it("matches the extension to the mime type", () => {
    expect(imageExtension("image/webp")).toBe("webp");
    expect(imageExtension("image/jpeg")).toBe("jpg");
    expect(imageExtension("image/png")).toBe("png");
  });
});

describe("imageMeta", () => {
  it("reads quality off the model id", () => {
    expect(imageMeta(makeImage())).toBe("generated · fast · 1k");
    expect(
      imageMeta(makeImage({ model: "grok-imagine-image-quality", resolution: "2k" })),
    ).toBe("generated · quality · 2k");
  });
});
