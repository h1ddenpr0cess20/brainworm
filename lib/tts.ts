const MAX_TTS_LENGTH = 15_000;

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
