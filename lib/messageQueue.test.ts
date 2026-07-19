import { describe, expect, it } from "vitest";
import {
  enqueueMessage,
  nextQueuedMessageForConversation,
  removeQueuedMessage,
  type QueuedMessage,
} from "./messageQueue";

function queued(id: string, conversationId: string): QueuedMessage {
  return {
    id,
    conversationId,
    content: `message ${id}`,
    codeMode: "normal",
    files: [],
  };
}

describe("message queue", () => {
  it("appends messages without mutating the existing queue", () => {
    const first = queued("one", "conversation-a");
    const original = [first];
    const next = enqueueMessage(original, queued("two", "conversation-a"));

    expect(original).toEqual([first]);
    expect(next.map((message) => message.id)).toEqual(["one", "two"]);
  });

  it("selects the oldest queued message for the requested conversation", () => {
    const queue = [
      queued("other", "conversation-b"),
      queued("first", "conversation-a"),
      queued("second", "conversation-a"),
    ];

    expect(nextQueuedMessageForConversation(queue, "conversation-a")?.id).toBe("first");
    expect(nextQueuedMessageForConversation(queue, "missing")).toBeUndefined();
  });

  it("removes only the requested queued message", () => {
    const queue = [
      queued("first", "conversation-a"),
      queued("second", "conversation-a"),
      queued("other", "conversation-b"),
    ];

    expect(removeQueuedMessage(queue, "second").map((message) => message.id)).toEqual([
      "first",
      "other",
    ]);
  });
});
