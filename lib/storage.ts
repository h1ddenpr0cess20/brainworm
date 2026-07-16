import type { PersistedState } from "./types";

export const STORAGE_KEY = "brainworm.state.v1";
export const XAI_API_KEY_STORAGE_KEY = "brainworm.xai_api_key.v1";

export function loadState(): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PersistedState>;
    if (value.version !== 1 || !Array.isArray(value.conversations)) return null;
    return value as PersistedState;
  } catch {
    return null;
  }
}

export function saveState(state: PersistedState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A full or unavailable storage area should not break the chat session.
  }
}

export function loadXaiApiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(XAI_API_KEY_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveXaiApiKey(apiKey: string): void {
  if (typeof window === "undefined") return;
  try {
    if (apiKey) {
      window.localStorage.setItem(XAI_API_KEY_STORAGE_KEY, apiKey);
    } else {
      window.localStorage.removeItem(XAI_API_KEY_STORAGE_KEY);
    }
  } catch {
    // An unavailable storage area should not prevent use for the current session.
  }
}
