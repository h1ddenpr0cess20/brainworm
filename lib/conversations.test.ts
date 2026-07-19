import { describe, expect, it } from "vitest";
import type { Conversation, Message } from "./types";
import {
  appendMessageVariant,
  branchFromMessage,
  selectMessageVariant,
  snapshotMessage,
} from "./conversations";

function assistant(overrides: Partial<Message> = {}): Message {
  return {
    id: "assistant-1",
    role: "assistant",
    content: "First answer",
    createdAt: 2,
    status: "complete",
    sources: [{ title: "First source", url: "https://example.com/first" }],
    ...overrides,
  };
}

function conversation(messages: Message[]): Conversation {
  return {
    id: "thread-1",
    title: "A conversation title",
    createdAt: 1,
    updatedAt: 2,
    messages,
  };
}

describe("message variants", () => {
  it("snapshots content and sources without sharing mutable source objects", () => {
    const message = assistant();
    const snapshot = snapshotMessage(message);

    expect(snapshot).toEqual({ content: message.content, sources: message.sources });
    expect(snapshot.sources).not.toBe(message.sources);
    expect(snapshot.sources?.[0]).not.toBe(message.sources?.[0]);
  });

  it("keeps the original response and selects a newly appended response", () => {
    const updated = appendMessageVariant(assistant(), {
      content: "Second answer",
      sources: [{ title: "Second source", url: "https://example.com/second" }],
    });

    expect(updated.variants).toHaveLength(2);
    expect(updated.variantIndex).toBe(1);
    expect(updated.content).toBe("Second answer");
    expect(updated.status).toBe("complete");
  });

  it("switches versions without changing the stored variants", () => {
    const regenerated = appendMessageVariant(assistant(), { content: "Second answer" });
    const selected = selectMessageVariant(regenerated, 0);

    expect(selected.content).toBe("First answer");
    expect(selected.variantIndex).toBe(0);
    expect(selected.variants).toBe(regenerated.variants);
  });

  it("ignores an out-of-range version index", () => {
    const message = assistant({ variants: [{ content: "First answer" }] });
    expect(selectMessageVariant(message, 8)).toBe(message);
  });

  it("carries plan state per variant so switching versions restores the right one", () => {
    const proposed = assistant({ codeMode: "plan", planState: "proposed" });
    const approved = appendMessageVariant(proposed, {
      content: "Approved answer",
      codeMode: "normal",
      planState: undefined,
    });

    expect(approved.codeMode).toBe("normal");
    expect(approved.planState).toBeUndefined();

    const backToFirst = selectMessageVariant(approved, 0);
    expect(backToFirst.codeMode).toBe("plan");
    expect(backToFirst.planState).toBe("proposed");
  });
});

describe("conversation branching", () => {
  it("copies the transcript through the selected message with fresh ids", () => {
    const user: Message = {
      id: "user-1",
      role: "user",
      content: "Question",
      createdAt: 1,
      status: "complete",
      attachments: ["notes.txt"],
    };
    let sequence = 0;
    const generated = {
      id: "image-1",
      prompt: "A brainworm",
      mimeType: "image/png",
      model: "grok-imagine-image" as const,
      aspectRatio: "1:1",
      resolution: "1k" as const,
      kind: "generated" as const,
      createdAt: 2,
    };
    const response = assistant({
      images: [generated],
      variants: [{ content: "First answer", sources: [{ title: "A", url: "https://a.test" }] }],
    });
    const branch = branchFromMessage(
      conversation([user, response, { ...user, id: "user-2", content: "Follow-up" }]),
      "assistant-1",
      (prefix) => `${prefix}-${++sequence}`,
      100,
    );

    expect(branch).toMatchObject({
      id: "thread-1",
      title: "A conversation title (branch)",
      createdAt: 100,
      updatedAt: 100,
    });
    expect(branch?.messages).toHaveLength(2);
    expect(branch?.messages.map((message) => message.id)).toEqual(["user-2", "worm-3"]);
    expect(branch?.messages[0].attachments).toEqual(["notes.txt"]);
    expect(branch?.messages[0].attachments).not.toBe(user.attachments);
    expect(branch?.messages[1].images).not.toBe(response.images);
    expect(branch?.messages[1].variants).not.toBe(response.variants);
    expect(branch?.messages[1].variants?.[0].sources?.[0]).not.toBe(
      response.variants?.[0].sources?.[0],
    );
  });

  it("returns null when the branch point does not exist", () => {
    expect(branchFromMessage(conversation([assistant()]), "missing", () => "unused")).toBeNull();
  });
});
