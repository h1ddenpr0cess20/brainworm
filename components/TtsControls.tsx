"use client";

import { useSyncExternalStore } from "react";
import {
  downloadTtsMessage,
  getTtsServerSnapshot,
  getTtsSnapshot,
  playTtsMessage,
  stopTtsMessage,
  subscribeTts,
} from "@/lib/ttsClient";
import { DownloadIcon, PauseIcon, PlayIcon, StopIcon, VolumeIcon } from "./Icons";

type TtsControlsProps = {
  messageId: string;
  text: string;
  voice: string;
  speed: number;
};

export function TtsControls({ messageId, text, voice, speed }: TtsControlsProps) {
  const playback = useSyncExternalStore(subscribeTts, getTtsSnapshot, getTtsServerSnapshot);
  const isActive = playback.messageId === messageId;
  const status = isActive ? playback.status : "idle";
  const request = { messageId, text, voice, speed };

  return (
    <div className="tts-controls" aria-label="Read message aloud">
      <VolumeIcon className="tts-controls__voice" />
      <button
        onClick={() => void playTtsMessage(request)}
        disabled={status === "loading"}
        aria-label={status === "playing" ? "Pause voice" : "Play voice"}
        title={status === "playing" ? "Pause voice" : "Play voice"}
      >
        {status === "loading" ? (
          <span className="tts-spinner" />
        ) : status === "playing" ? (
          <PauseIcon />
        ) : (
          <PlayIcon />
        )}
      </button>
      {(status === "playing" || status === "paused") && (
        <button
          onClick={() => stopTtsMessage(messageId)}
          aria-label="Stop voice"
          title="Stop voice"
        >
          <StopIcon />
        </button>
      )}
      <button
        onClick={() => void downloadTtsMessage(request)}
        disabled={status === "loading"}
        aria-label="Download voice clip"
        title="Download voice clip"
      >
        <DownloadIcon />
      </button>
      <span
        className={`tts-controls__status ${status === "error" ? "is-error" : ""}`}
        aria-live="polite"
      >
        {status === "loading"
          ? "growing a voice…"
          : status === "playing"
            ? voice
            : status === "paused"
              ? "paused"
              : isActive && playback.error
                ? playback.error
                : ""}
      </span>
    </div>
  );
}
