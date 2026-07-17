"use client";

import { useEffect } from "react";
import type { Theme } from "@/lib/types";
import { desktopBridge, isDesktopApp, titleBarColors } from "@/lib/desktop";
import { BrainLogo } from "./BrainLogo";

/**
 * The custom title bar for the Electron desktop shell: a frameless-window drag
 * strip carrying the Brainworm mark. It also mirrors the active theme onto the
 * native window-control overlay (Windows/Linux; macOS keeps its traffic
 * lights). Renders nothing in a regular browser.
 */
export function DesktopTitlebar({ theme }: { theme: Theme }) {
  useEffect(() => {
    desktopBridge()
      ?.setTitleBarColors(titleBarColors(theme))
      .catch(() => {});
  }, [theme]);

  if (!isDesktopApp()) return null;

  return (
    <div className="desktop-titlebar">
      <BrainLogo className="desktop-titlebar__mark" />
      <span>Brainworm</span>
    </div>
  );
}
