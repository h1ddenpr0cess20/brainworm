import type { Conversation, Message, MessageVariant } from "./types";

export function snapshotMessage(message: Message): MessageVariant {
  return {
    content: message.content,
    sources: message.sources?.map((source) => ({ ...source })),
  };
}

export function selectMessageVariant(message: Message, index: number): Message {
  const variant = message.variants?.[index];
  if (!variant) return message;
  return {
    ...message,
    content: variant.content,
    sources: variant.sources?.map((source) => ({ ...source })),
    variantIndex: index,
    status: "complete",
  };
}

export function appendMessageVariant(message: Message, variant: MessageVariant): Message {
  const variants = [...(message.variants ?? [snapshotMessage(message)]), variant];
  return {
    ...message,
    content: variant.content,
    sources: variant.sources?.map((source) => ({ ...source })),
    status: "complete",
    variants,
    variantIndex: variants.length - 1,
  };
}

export function branchFromMessage(
  source: Conversation,
  messageId: string,
  makeId: (prefix: string) => string,
  now = Date.now(),
): Conversation | null {
  const cut = source.messages.findIndex((message) => message.id === messageId);
  if (cut < 0) return null;

  return {
    id: makeId("thread"),
    title: `${source.title} (branch)`.slice(0, 60),
    createdAt: now,
    updatedAt: now,
    messages: source.messages.slice(0, cut + 1).map((message) => ({
      ...message,
      id: makeId(message.role === "user" ? "user" : "worm"),
      attachments: message.attachments ? [...message.attachments] : undefined,
      sources: message.sources?.map((item) => ({ ...item })),
      images: message.images?.map((image) => ({ ...image })),
      variants: message.variants?.map((variant) => ({
        ...variant,
        sources: variant.sources?.map((item) => ({ ...item })),
      })),
    })),
  };
}
