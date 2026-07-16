const MAX_TTS_LENGTH = 15_000;

type TtsModeState = {
  appMode: "chat" | "code" | "imagine";
  ttsEnabled: boolean;
};

/** Returns true when a change would newly allow voice playback in Code mode. */
export function needsTtsCodeModeConfirmation(current: TtsModeState, next: TtsModeState): boolean {
  return (
    next.appMode === "code" &&
    next.ttsEnabled &&
    (current.appMode !== "code" || !current.ttsEnabled)
  );
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
