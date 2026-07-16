"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/lib/types";
import { BrainLogo } from "./BrainLogo";
import { BranchIcon, CopyIcon, RegenerateIcon } from "./Icons";
import { TtsControls } from "./TtsControls";
import { GeneratedImageGallery } from "./GeneratedImageGallery";

type ChatMessageProps = {
  message: Message;
  tts?: {
    enabled: boolean;
    voice: string;
    speed: number;
  };
  busy?: boolean;
  onRegenerate?: (messageId: string) => void;
  onBranch?: (messageId: string) => void;
  onSelectVariant?: (messageId: string, index: number) => void;
};

export function ChatMessage({
  message,
  tts,
  busy = false,
  onRegenerate,
  onBranch,
  onSelectVariant,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isAssistant = message.role === "assistant";
  const versionCount = message.variants?.length ?? 0;
  const currentVersion = (message.variantIndex ?? 0) + 1;

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <article className={`message message--${message.role} ${message.status === "error" ? "message--error" : ""}`}>
      <div className="message__gutter">
        {isAssistant ? (
          <BrainLogo className="message__avatar" />
        ) : (
          <span className="message__initial" aria-label="You">Y</span>
        )}
      </div>
      <div className="message__body">
        <div className="message__meta">
          <span>{isAssistant ? "Brainworm" : "You"}</span>
          <time dateTime={new Date(message.createdAt).toISOString()}>
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
        </div>
        <div className="message__content">
          {message.attachments && message.attachments.length > 0 && (
            <div className="message__attachments">
              {message.attachments.map((name) => <span key={name}>@{name}</span>)}
            </div>
          )}
          {isAssistant ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ children, ...props }) => (
                  <a {...props} target="_blank" rel="noreferrer">{children}</a>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          ) : (
            <p>{message.content}</p>
          )}
          {message.status === "streaming" && <span className="message__cursor" aria-label="Writing" />}
        </div>
        {message.images && message.images.length > 0 && <GeneratedImageGallery images={message.images} />}
        {message.sources && message.sources.length > 0 && (
          <div className="message__sources" aria-label="Sources">
            <span>Breadcrumbs</span>
            <div>
              {message.sources.map((source, index) => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                  <b>{index + 1}</b>{source.title}
                </a>
              ))}
            </div>
          </div>
        )}
        {message.status !== "streaming" && message.content && (
          <div className="message__actions">
            <button className="message__action" onClick={copy} aria-label="Copy message" title="Copy message">
              <CopyIcon />
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
            {isAssistant && onRegenerate && !message.images?.length && (
              <button
                className="message__action"
                onClick={() => onRegenerate(message.id)}
                disabled={busy}
                aria-label="Regenerate reply"
                title="Regenerate reply"
              ><RegenerateIcon /><span>Regenerate</span></button>
            )}
            {isAssistant && onBranch && (
              <button
                className="message__action"
                onClick={() => onBranch(message.id)}
                disabled={busy}
                aria-label="Branch conversation from here"
                title="Branch conversation from here"
              ><BranchIcon /><span>Branch</span></button>
            )}
            {versionCount > 1 && onSelectVariant && (
              <span className="message__versions" aria-label={`Reply version ${currentVersion} of ${versionCount}`}>
                <button
                  disabled={currentVersion <= 1}
                  onClick={() => onSelectVariant(message.id, (message.variantIndex ?? 0) - 1)}
                  aria-label="Previous reply version"
                >‹</button>
                <span>{currentVersion}/{versionCount}</span>
                <button
                  disabled={currentVersion >= versionCount}
                  onClick={() => onSelectVariant(message.id, (message.variantIndex ?? 0) + 1)}
                  aria-label="Next reply version"
                >›</button>
              </span>
            )}
            {isAssistant && tts?.enabled && message.status === "complete" && (
              <TtsControls messageId={message.id} text={message.content} voice={tts.voice} speed={tts.speed} />
            )}
          </div>
        )}
      </div>
    </article>
  );
}
