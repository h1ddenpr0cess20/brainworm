"use client";

import { useEffect, useRef, useState } from "react";
import type { Conversation, Theme } from "@/lib/types";
import {
  EXPORT_FORMAT_LIST,
  exportConversation,
  type ExportFormatKey,
} from "@/lib/conversationExport";
import { DownloadIcon } from "./Icons";

type ExportMenuProps = {
  conversation?: Conversation;
  theme: Theme;
};

/** The topbar control that exports the active conversation in a chosen format. */
export function ExportMenu({ conversation, theme }: ExportMenuProps) {
  const [format, setFormat] = useState<ExportFormatKey>("md");
  const [includeSources, setIncludeSources] = useState(true);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!conversation) return null;

  const hasMessages = conversation.messages.some(
    (message) => message.status !== "streaming" && message.content.trim(),
  );

  const onExport = () => {
    const ok = exportConversation(conversation, format, includeSources, theme);
    setStatus(ok ? "Exported." : "Nothing to export yet.");
    if (ok) setOpen(false);
  };

  return (
    <div className="export-menu" ref={rootRef}>
      <button
        type="button"
        className="export-menu__trigger"
        onClick={() => {
          setStatus("");
          setOpen((current) => !current);
        }}
        title="Export this conversation"
        aria-label="Export this conversation"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!hasMessages}
      >
        <DownloadIcon />
      </button>

      {open && (
        <div className="export-menu__panel" role="menu">
          <div className="export-menu__label">Format</div>
          <div className="export-menu__formats">
            {EXPORT_FORMAT_LIST.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitemradio"
                aria-checked={format === item.key}
                className={`export-menu__format ${format === item.key ? "is-on" : ""}`}
                onClick={() => setFormat(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="toggle-row export-menu__toggle">
            <span>Include sources</span>
            <input
              type="checkbox"
              checked={includeSources}
              onChange={(event) => setIncludeSources(event.target.checked)}
            />
            <span className="toggle" aria-hidden="true">
              <span />
            </span>
          </label>

          <button type="button" className="export-menu__submit" onClick={onExport}>
            Export conversation
          </button>
          {status && <span className="export-menu__status">{status}</span>}
        </div>
      )}
    </div>
  );
}
