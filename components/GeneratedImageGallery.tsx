"use client";

import { useState } from "react";
import type { GeneratedImageRef } from "@/lib/types";
import { imageMeta } from "@/lib/gallery";
import { downloadImage, useImageBlobUrl } from "@/lib/imageStorage";
import { DownloadIcon } from "./Icons";
import { ImageLightbox } from "./ImageLightbox";

export function GeneratedImageGallery({ images }: { images: GeneratedImageRef[] }) {
  const [zoomed, setZoomed] = useState<GeneratedImageRef | null>(null);

  return (
    <div className={`generated-gallery ${images.length > 1 ? "is-grid" : ""}`}>
      {images.map((image) => (
        <GeneratedImageCard key={image.id} image={image} onZoom={setZoomed} />
      ))}
      {zoomed && <ImageLightbox image={zoomed} onClose={() => setZoomed(null)} />}
    </div>
  );
}

function GeneratedImageCard({
  image,
  onZoom,
}: {
  image: GeneratedImageRef;
  onZoom: (image: GeneratedImageRef) => void;
}) {
  const url = useImageBlobUrl(image.id);

  return (
    <figure className="generated-image">
      {url ? (
        <button
          className="generated-image__zoom"
          onClick={() => onZoom(image)}
          aria-label="View full size"
        >
          {/* Blob URLs are local IndexedDB assets and cannot be optimized by next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={image.prompt} />
        </button>
      ) : (
        <div className="generated-image__loading">
          <span />
        </div>
      )}
      <figcaption>
        <span>{image.prompt}</span>
        <small>{imageMeta(image)}</small>
        <button onClick={() => void downloadImage(image)} aria-label="Download generated image">
          <DownloadIcon />
        </button>
      </figcaption>
    </figure>
  );
}
