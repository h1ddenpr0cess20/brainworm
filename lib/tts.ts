const MAX_TTS_LENGTH = 15_000;

type TtsModeState = {
  appMode: "chat" | "code" | "imagine";
  ttsEnabled: boolean;
};

/**
 * Returns true when voice playback should actually happen. Code mode never
 * speaks — it could read source code, terminal output, and secrets aloud —
 * while the saved TTS preference stays intact for the other modes.
 */
export function isTtsActive(state: TtsModeState): boolean {
  return state.ttsEnabled && state.appMode !== "code";
}

/** Turns rendered Markdown into text that sounds natural when read aloud. */
export function toSpeechText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\|/g, ", ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TTS_LENGTH);
}

export function isTtsSpeed(value: number): boolean {
  return Number.isFinite(value) && value >= 0.7 && value <= 1.5;
}
