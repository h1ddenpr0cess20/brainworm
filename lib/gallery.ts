import type { Conversation, GeneratedImageRef } from "./types";

export type GalleryItem = {
  image: GeneratedImageRef;
  conversationId: string;
  conversationTitle: string;
};

/** Every image the worm has made, newest first, across all threads. */
export function collectGalleryItems(conversations: Conversation[]): GalleryItem[] {
  const items: GalleryItem[] = [];
  for (const conversation of conversations) {
    for (const message of conversation.messages) {
      for (const image of message.images ?? []) {
        items.push({
          image,
          conversationId: conversation.id,
          conversationTitle: conversation.title,
        });
      }
    }
  }
  return items.sort((left, right) => right.image.createdAt - left.image.createdAt);
}

export function imageExtension(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
}

export function imageFileName(image: GeneratedImageRef): string {
  const slug = image.prompt
    .replace(/[^\w\s-]/g, "")
    .trim()
    .slice(0, 60)
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `brainworm-${slug || image.kind}.${imageExtension(image.mimeType)}`;
}

export function imageMeta(image: GeneratedImageRef): string {
  const quality = image.model.endsWith("quality") ? "quality" : "fast";
  return `${image.kind} · ${quality} · ${image.resolution}`;
}
