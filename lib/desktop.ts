/**
 * Bridge to the Electron desktop shell (`electron/preload.cjs`).
 *
 * The desktop window is frameless (`titleBarStyle: "hidden"` in
 * `electron/main.cjs`), so the web app renders its own drag strip
 * (see {@link ../components/DesktopTitlebar}) and pushes the active theme's
 * colors to the native window-control overlay on Windows and Linux. In a
 * regular browser the bridge is absent and every helper here is inert.
 */

import type { Theme } from "./types";

/** Bridge exposed by `electron/preload.cjs` when running in the desktop app. */
export interface DesktopBridge {
  platform: string;
  setTitleBarColors: (colors: { color: string; symbolColor: string }) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
}

declare global {
  interface Window {
    brainwormDesktop?: DesktopBridge;
  }
}

/** Height of the custom title bar, shared with `DesktopTitlebar.module.css`. */
export const TITLEBAR_HEIGHT = 36;

/** Title bar background/accent per theme, matching `--paper`/`--moss` in globals.css. */
const TITLEBAR_COLORS: Record<Theme, { bg: string; symbol: string }> = {
  paper: { bg: "#f2ead8", symbol: "#55663a" },
  night: { bg: "#24251e", symbol: "#a5b67b" },
};

export function titleBarColors(theme: Theme): { color: string; symbolColor: string } {
  const { bg, symbol } = TITLEBAR_COLORS[theme];
  return { color: bg, symbolColor: symbol };
}

/** The preload bridge, or `undefined` in a plain browser. */
export function desktopBridge(): DesktopBridge | undefined {
  return typeof window !== "undefined" ? window.brainwormDesktop : undefined;
}

/** Whether the app is running inside the Electron desktop shell. */
export function isDesktopApp(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.brainwormDesktop) || navigator.userAgent.includes("Electron");
}

export async function copyText(text: string): Promise<boolean> {
  const native = desktopBridge()?.writeText;
  if (native) {
    try {
      await native(text);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
