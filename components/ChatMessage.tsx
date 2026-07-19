"use client";

import {
  Children,
  isValidElement,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import type { Message } from "@/lib/types";
import { normalizeChatHref } from "@/lib/chatLinks";
import { copyText } from "@/lib/desktop";
import { describeToolActivity, findResponseItem } from "@/lib/toolDetails";
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
    apiKey: string;
  };
  busy?: boolean;
  onRegenerate?: (messageId: string) => void;
  onBranch?: (messageId: string) => void;
  onSelectVariant?: (messageId: string, index: number) => void;
  onApprovePlan?: (messageId: string) => void;
  onRequestPlanChanges?: (messageId: string) => void;
};

function codeLanguage(children: ReactNode): string | null {
  for (const child of Children.toArray(children)) {
    if (!isValidElement<{ className?: string }>(child)) continue;

    const languageClass = child.props.className
      ?.split(/\s+/)
      .find((className) => className.startsWith("language-"));

    if (languageClass) return languageClass.slice("language-".length);
  }

  return null;
}

function CodeBlock({ children, ...props }: ComponentPropsWithoutRef<"pre">) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLPreElement>(null);
  const language = codeLanguage(children);

  const copy = async () => {
    await copyText(codeRef.current?.textContent ?? "");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="message__code-block">
      <div className="message__code-toolbar">
        <span>{language ?? "code"}</span>
        <button type="button" onClick={copy} aria-label="Copy code" title="Copy code">
          <CopyIcon />
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre {...props} ref={codeRef}>
        {children}
      </pre>
    </div>
  );
}

// react-markdown sanitizes every URL before the `a` component renders: a
// scheme-less destination with a port ("localhost:3000/files/report.pdf")
// parses as an unknown "localhost:" protocol and is stripped to "", so the
// anchor silently navigated to the app's own origin. Normalizing before the
// sanitizer runs gives it a real http(s) URL to approve.
function chatUrlTransform(url: string) {
  return defaultUrlTransform(normalizeChatHref(url) ?? "");
}

export function ChatMessage({
  message,
  tts,
  busy = false,
  onRegenerate,
  onBranch,
  onSelectVariant,
  onApprovePlan,
  onRequestPlanChanges,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isAssistant = message.role === "assistant";
  const versionCount = message.variants?.length ?? 0;
  const currentVersion = (message.variantIndex ?? 0) + 1;

  const copy = async () => {
    await copyText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <article
      className={`message message--${message.role} ${message.status === "error" ? "message--error" : ""}`}
    >
      <div className="message__gutter">
        {isAssistant ? (
          <BrainLogo className="message__avatar" />
        ) : (
          <span className="message__initial" aria-label="You">
            Y
          </span>
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
              {message.attachments.map((name) => (
                <span key={name}>@{name}</span>
              ))}
            </div>
          )}
          {isAssistant ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              urlTransform={chatUrlTransform}
              components={{
                a: ({ children, ...props }) => (
                  <a {...props} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                ),
                pre: CodeBlock,
              }}
            >
              {message.content}
            </ReactMarkdown>
          ) : (
            <p>{message.content}</p>
          )}
          {message.status === "streaming" && (
            <span className="message__cursor" aria-label="Writing" />
          )}
        </div>
        {message.images && message.images.length > 0 && (
          <GeneratedImageGallery images={message.images} />
        )}
        {message.sources && message.sources.length > 0 && (
          <div className="message__sources" aria-label="Sources">
            <span>Breadcrumbs</span>
            <div>
              {message.sources.map((source, index) => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                  <b>{index + 1}</b>
                  {source.title}
                </a>
              ))}
            </div>
          </div>
        )}
        {message.tools && message.tools.length > 0 && (
          <div className="message__tools" aria-label="Tool activity">
            <span>Tools</span>
            <div>
              {message.tools.map((tool) => {
                const item = findResponseItem(message.responseItems, tool.id);
                return (
                  <span
                    className={`is-${tool.status}`}
                    key={tool.id}
                    tabIndex={item ? 0 : undefined}
                  >
                    <i />
                    {tool.server ? `${tool.server} · ` : ""}
                    {tool.name}
                    {item && (
                      <span className="message__tool-tip" role="tooltip">
                        {describeToolActivity(tool, item)}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {isAssistant &&
          message.codeMode === "plan" &&
          message.status === "complete" &&
          message.planState && (
            <div className="message__plan-actions" aria-label="Plan approval">
              {message.planState === "proposed" ? (
                <>
                  <button onClick={() => onApprovePlan?.(message.id)} disabled={busy}>
                    Approve and implement
                  </button>
                  <button
                    className="is-secondary"
                    onClick={() => onRequestPlanChanges?.(message.id)}
                    disabled={busy}
                  >
                    Request changes
                  </button>
                </>
              ) : (
                <span>
                  {message.planState === "approved" ? "Plan approved" : "Changes requested"}
                </span>
              )}
            </div>
          )}
        {message.status !== "streaming" && message.content && (
          <div className="message__actions">
            <button className="message__action" onClick={copy} aria-label="Copy message">
              <CopyIcon />
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
            {isAssistant && onRegenerate && !message.images?.length && (
              <button
                className="message__action"
                onClick={() => onRegenerate(message.id)}
                disabled={busy}
                aria-label="Regenerate reply"
              >
                <RegenerateIcon />
                <span>Regenerate</span>
              </button>
            )}
            {isAssistant && onBranch && (
              <button
                className="message__action"
                onClick={() => onBranch(message.id)}
                disabled={busy}
                aria-label="Branch conversation from here"
              >
                <BranchIcon />
                <span>Branch</span>
              </button>
            )}
            {versionCount > 1 && onSelectVariant && (
              <span
                className="message__versions"
                aria-label={`Reply version ${currentVersion} of ${versionCount}`}
              >
                <button
                  disabled={currentVersion <= 1}
                  onClick={() => onSelectVariant(message.id, (message.variantIndex ?? 0) - 1)}
                  aria-label="Previous reply version"
                >
                  ‹
                </button>
                <span>
                  {currentVersion}/{versionCount}
                </span>
                <button
                  disabled={currentVersion >= versionCount}
                  onClick={() => onSelectVariant(message.id, (message.variantIndex ?? 0) + 1)}
                  aria-label="Next reply version"
                >
                  ›
                </button>
              </span>
            )}
            {isAssistant && tts?.enabled && message.status === "complete" && (
              <TtsControls
                messageId={message.id}
                text={message.content}
                voice={tts.voice}
                speed={tts.speed}
                apiKey={tts.apiKey}
              />
            )}
          </div>
        )}
      </div>
    </article>
  );
}
