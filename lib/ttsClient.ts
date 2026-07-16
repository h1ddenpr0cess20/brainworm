"use client";

import { toSpeechText } from "./tts";

export type TtsPlaybackStatus = "idle" | "loading" | "playing" | "paused" | "error";

export type TtsPlaybackState = {
  messageId: string | null;
  status: TtsPlaybackStatus;
  error: string | null;
};

type SpeechRequest = {
  messageId: string;
  text: string;
  voice: string;
  speed: number;
};

type ActiveClip = SpeechRequest & {
  key: string;
  audio: HTMLAudioElement;
  url: string;
};

const CACHE_NAME = "brainworm-tts-v1";
const memoryCache = new Map<string, Blob>();
const listeners = new Set<() => void>();
const autoplayQueue: SpeechRequest[] = [];
const SERVER_SNAPSHOT: TtsPlaybackState = { messageId: null, status: "idle", error: null };

let snapshot: TtsPlaybackState = SERVER_SNAPSHOT;
let active: ActiveClip | null = null;
let requestGeneration = 0;

export function subscribeTts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTtsSnapshot(): TtsPlaybackState {
  return snapshot;
}

export function getTtsServerSnapshot(): TtsPlaybackState {
  return SERVER_SNAPSHOT;
}

export async function playTtsMessage(request: SpeechRequest): Promise<void> {
  autoplayQueue.length = 0;
  if (active?.messageId === request.messageId && active.voice === request.voice && active.speed === request.speed) {
    if (snapshot.status === "playing") {
      active.audio.pause();
      emit({ messageId: request.messageId, status: "paused", error: null });
      return;
    }
    if (snapshot.status === "paused") {
      await resumeActive();
      return;
    }
  }
  await startSpeech(request, false);
}

export async function autoplayTtsMessage(request: SpeechRequest): Promise<void> {
  if (
    active &&
    (snapshot.status === "loading" || snapshot.status === "playing" || snapshot.status === "paused")
  ) {
    if (!autoplayQueue.some((item) => item.messageId === request.messageId)) {
      autoplayQueue.push(request);
    }
    return;
  }
  await startSpeech(request, true);
}

export function stopTtsMessage(messageId?: string): void {
  autoplayQueue.length = 0;
  if (!active || (messageId && active.messageId !== messageId)) return;
  active.audio.pause();
  active.audio.currentTime = 0;
  const stoppedId = active.messageId;
  disposeActive();
  emit({ messageId: stoppedId, status: "idle", error: null });
}

export async function downloadTtsMessage(request: SpeechRequest): Promise<void> {
  const spoken = toSpeechText(request.text);
  if (!spoken) return;
  try {
    const key = await makeCacheKey(spoken, request.voice, request.speed);
    const blob = await getOrCreateAudio(key, spoken, request.voice, request.speed);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `brainworm-${request.voice}-${new Date().toISOString().replace(/[:.]/g, "-")}.mp3`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  } catch (error) {
    console.error("Voice clip download failed", error);
  }
}

export async function clearTtsCache(): Promise<void> {
  stopTtsMessage();
  memoryCache.clear();
  if (typeof caches !== "undefined") await caches.delete(CACHE_NAME);
}

async function startSpeech(request: SpeechRequest, preserveQueue: boolean): Promise<void> {
  const spoken = toSpeechText(request.text);
  if (!spoken) return;
  if (!preserveQueue) autoplayQueue.length = 0;
  requestGeneration += 1;
  const generation = requestGeneration;
  disposeActive();
  emit({ messageId: request.messageId, status: "loading", error: null });

  try {
    const key = await makeCacheKey(spoken, request.voice, request.speed);
    const blob = await getOrCreateAudio(key, spoken, request.voice, request.speed);
    if (generation !== requestGeneration) return;

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    active = { ...request, key, audio, url };
    audio.addEventListener("ended", () => {
      const finishedId = active?.messageId ?? request.messageId;
      disposeActive();
      emit({ messageId: finishedId, status: "idle", error: null });
      window.setTimeout(() => void playNextAutoplay(), 300);
    }, { once: true });
    audio.addEventListener("error", () => {
      disposeActive();
      emit({ messageId: request.messageId, status: "error", error: "That audio clip could not be played." });
      window.setTimeout(() => void playNextAutoplay(), 300);
    }, { once: true });
    await audio.play();
    emit({ messageId: request.messageId, status: "playing", error: null });
  } catch (error) {
    disposeActive();
    const blocked = error instanceof DOMException && error.name === "NotAllowedError";
    emit({
      messageId: request.messageId,
      status: blocked ? "idle" : "error",
      error: blocked ? "Press play once to let this browser read replies aloud." : errorMessage(error),
    });
  }
}

async function resumeActive(): Promise<void> {
  if (!active) return;
  try {
    await active.audio.play();
    emit({ messageId: active.messageId, status: "playing", error: null });
  } catch (error) {
    emit({ messageId: active.messageId, status: "error", error: errorMessage(error) });
  }
}

async function playNextAutoplay(): Promise<void> {
  const next = autoplayQueue.shift();
  if (next) await startSpeech(next, true);
}

function disposeActive(): void {
  if (!active) return;
  active.audio.pause();
  active.audio.removeAttribute("src");
  URL.revokeObjectURL(active.url);
  active = null;
}

async function getOrCreateAudio(key: string, text: string, voice: string, speed: number): Promise<Blob> {
  const inMemory = memoryCache.get(key);
  if (inMemory) return inMemory;

  const cache = await getCache();
  const cacheRequest = new Request(`${window.location.origin}/__brainworm_tts_cache__/${key}`);
  const cachedResponse = await cache?.match(cacheRequest);
  if (cachedResponse) {
    const blob = await cachedResponse.blob();
    memoryCache.set(key, blob);
    return blob;
  }

  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, speed }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || `Speech generation failed (${response.status}).`);
  }
  const blob = await response.blob();
  memoryCache.set(key, blob);
  await cache?.put(cacheRequest, new Response(blob, { headers: { "Content-Type": blob.type || "audio/mpeg" } }));
  return blob;
}

async function getCache(): Promise<Cache | null> {
  if (typeof caches === "undefined") return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function makeCacheKey(text: string, voice: string, speed: number): Promise<string> {
  const input = new TextEncoder().encode(`${voice}\u0000${speed}\u0000${text}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function emit(next: TtsPlaybackState): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Speech generation failed.";
}
