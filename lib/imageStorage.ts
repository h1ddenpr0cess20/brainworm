"use client";

import { useEffect, useState } from "react";
import { imageFileName } from "./gallery";
import type { GeneratedImageRef } from "./types";

const DATABASE_NAME = "brainworm-media";
const STORE_NAME = "images";
const DATABASE_VERSION = 1;

export async function saveImageBlob(id: string, blob: Blob): Promise<void> {
  const database = await openDatabase();
  await transactionPromise(database, "readwrite", (store) => store.put(blob, id));
  database.close();
}

export async function loadImageBlob(id: string): Promise<Blob | null> {
  const database = await openDatabase();
  const result = await transactionPromise<Blob | undefined>(database, "readonly", (store) =>
    store.get(id),
  );
  database.close();
  return result ?? null;
}

export async function deleteImageBlob(id: string): Promise<void> {
  const database = await openDatabase();
  await transactionPromise(database, "readwrite", (store) => store.delete(id));
  database.close();
}

export async function clearImageBlobs(): Promise<void> {
  const database = await openDatabase();
  await transactionPromise(database, "readwrite", (store) => store.clear());
  database.close();
}

/**
 * Object URL for a stored image, revoked when the id changes or the caller
 * unmounts. Returns null until the blob is read out of IndexedDB.
 */
export function useImageBlobUrl(id: string): string | null {
  const [loaded, setLoaded] = useState<{ id: string; url: string } | null>(null);

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;
    void loadImageBlob(id).then((blob) => {
      if (!blob || cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setLoaded({ id, url: objectUrl });
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  // Tracking the id alongside the url keeps a revoked url from a previous id
  // out of the render that follows an id change.
  return loaded?.id === id ? loaded.url : null;
}

export async function downloadImage(image: GeneratedImageRef): Promise<void> {
  const blob = await loadImageBlob(image.id);
  if (!blob) return;
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = imageFileName(image);
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000);
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the image library."));
  });
}

function transactionPromise<T = IDBValidKey>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Image storage failed."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Image storage failed."));
  });
}
