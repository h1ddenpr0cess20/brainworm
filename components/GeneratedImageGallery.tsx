"use client";

import { useEffect, useState } from "react";
import type { GeneratedImageRef } from "@/lib/types";
import { loadImageBlob } from "@/lib/imageStorage";
import { DownloadIcon } from "./Icons";

export function GeneratedImageGallery({ images }: { images: GeneratedImageRef[] }) {
  return (
    <div className={`generated-gallery ${images.length > 1 ? "is-grid" : ""}`}>
      {images.map((image) => (
        <GeneratedImageCard key={image.id} image={image} />
      ))}
    </div>
  );
}

function GeneratedImageCard({ image }: { image: GeneratedImageRef }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;
    void loadImageBlob(image.id).then((blob) => {
      if (!blob || cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.id]);

  const download = async () => {
    const blob = await loadImageBlob(image.id);
    if (!blob) return;
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `brainworm-${image.kind}-${image.id}.${image.mimeType.includes("png") ? "png" : image.mimeType.includes("webp") ? "webp" : "jpg"}`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000);
  };

  return (
    <figure className="generated-image">
      {url ? (
        // Blob URLs are local IndexedDB assets and cannot be optimized by next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={image.prompt} />
      ) : (
        <div className="generated-image__loading">
          <span />
        </div>
      )}
      <figcaption>
        <span>
          {image.kind} · {image.model.endsWith("quality") ? "quality" : "fast"} · {image.resolution}
        </span>
        <button
          onClick={() => void download()}
          aria-label="Download generated image"
          title="Download image"
        >
          <DownloadIcon />
        </button>
      </figcaption>
    </figure>
  );
}
