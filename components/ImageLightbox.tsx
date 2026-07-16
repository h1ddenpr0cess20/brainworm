"use client";

import { useEffect } from "react";
import type { GeneratedImageRef } from "@/lib/types";
import { imageMeta } from "@/lib/gallery";
import { downloadImage, useImageBlobUrl } from "@/lib/imageStorage";
import { CloseIcon, DownloadIcon } from "./Icons";

/**
 * Full-size viewer for a stored image. Images live in IndexedDB and are shown
 * through object URLs, so there is nothing to open in a new tab — the full-size
 * view has to happen in-app.
 */
export function ImageLightbox({
  image,
  caption,
  onClose,
}: {
  image: GeneratedImageRef;
  caption?: string;
  onClose: () => void;
}) {
  const url = useImageBlobUrl(image.id);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="lightbox__inner">
        <div className="lightbox__bar">
          <button onClick={() => void downloadImage(image)} aria-label="Download image">
            <DownloadIcon />
          </button>
          <button onClick={onClose} aria-label="Close image viewer">
            <CloseIcon />
          </button>
        </div>
        {url ? (
          // Blob URLs are local IndexedDB assets and cannot be optimized by next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="lightbox__image" src={url} alt={image.prompt} />
        ) : (
          <div className="lightbox__loading">
            <span />
          </div>
        )}
        <figcaption className="lightbox__caption">
          <p>{image.prompt}</p>
          <small>
            {imageMeta(image)}
            {caption ? ` · ${caption}` : ""}
          </small>
        </figcaption>
      </div>
    </div>
  );
}
