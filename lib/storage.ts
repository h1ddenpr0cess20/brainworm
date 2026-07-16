import type { PersistedState } from "./types";

export const STORAGE_KEY = "brainworm.state.v1";

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
