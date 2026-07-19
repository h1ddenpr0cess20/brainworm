import type { CodeSessionMode, PendingFile } from "./types";

// Image attachments (PendingImage) only ever exist in Imagine mode, which has
// its own generation flow and never queues, so queued messages carry only
// the code-context files a Chat/Code send can have.
export type QueuedMessage = {
  id: string;
  conversationId: string;
  content: string;
  codeMode: CodeSessionMode;
  files: PendingFile[];
};

export function enqueueMessage(queue: QueuedMessage[], message: QueuedMessage): QueuedMessage[] {
  return [...queue, message];
}

export function nextQueuedMessageForConversation(
  queue: QueuedMessage[],
  conversationId: string,
): QueuedMessage | undefined {
  return queue.find((message) => message.conversationId === conversationId);
}

export function removeQueuedMessage(queue: QueuedMessage[], messageId: string): QueuedMessage[] {
  return queue.filter((message) => message.id !== messageId);
}
