"use client";

import { useState } from "react";
import type { GalleryItem } from "@/lib/gallery";
import { useImageBlobUrl } from "@/lib/imageStorage";
import { ImageLightbox } from "./ImageLightbox";

export function GalleryPanel({ items }: { items: GalleryItem[] }) {
  const [zoomed, setZoomed] = useState<GalleryItem | null>(null);

  if (items.length === 0) {
    return (
      <p className="gallery-empty">
        Nothing here yet — every image the worm dreams up in Imagine studio lands in this gallery.
      </p>
    );
  }

  return (
    <div className="gallery-grid">
      {items.map((item) => (
        <GalleryTile key={item.image.id} item={item} onOpen={setZoomed} />
      ))}
      {zoomed && (
        <ImageLightbox
          image={zoomed.image}
          caption={zoomed.conversationTitle}
          onClose={() => setZoomed(null)}
        />
      )}
    </div>
  );
}

function GalleryTile({ item, onOpen }: { item: GalleryItem; onOpen: (item: GalleryItem) => void }) {
  const url = useImageBlobUrl(item.image.id);

  return (
    <button className="gallery-tile" onClick={() => onOpen(item)}>
      {url ? (
        // Blob URLs are local IndexedDB assets and cannot be optimized by next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={item.image.prompt} loading="lazy" />
      ) : (
        <span className="gallery-tile__loading" />
      )}
      <span className="gallery-tile__caption">
        <small>{item.image.kind}</small>
        <span>{item.image.prompt}</span>
      </span>
    </button>
  );
}
