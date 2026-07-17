import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import type { Conversation, MessageRole, Source, Theme } from "./types";

export type ExportFormatKey = "txt" | "md" | "html" | "json" | "csv";

export interface ExportFormat {
  key: ExportFormatKey;
  label: string;
  extension: string;
  mime: string;
  build(messages: ExportMessage[], includeSources: boolean, meta: ExportMeta): string;
}

interface ExportMeta {
  iso: string;
  title: string;
  theme: Theme;
}

interface ExportMessage {
  role: MessageRole;
  senderLabel: string;
  content: string;
  sources: Source[];
  timestamp: string;
}

/** Turns a conversation's messages into the flat records the format builders consume. */
function normaliseMessages(convo: Conversation): ExportMessage[] {
  return convo.messages
    .filter((message) => message.status !== "streaming" && message.content.trim())
    .map((message) => ({
      role: message.role,
      senderLabel: message.role === "user" ? "You" : "Brainworm",
      content: message.content.trim(),
      sources: message.sources ?? [],
      timestamp: new Date(message.createdAt).toLocaleString(),
    }));
}

const HTML_COMPONENTS: Components = {
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
};

/** Renders markdown to a static HTML string with the same parser and highlighter the live chat uses. */
function renderMarkdown(text: string): string {
  if (!text) return "";
  return renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={HTML_COMPONENTS}
    >
      {text}
    </ReactMarkdown>,
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Quotes a value for a CSV cell and neutralises spreadsheet formula injection —
 * a leading `= + - @` (non-numeric) is prefixed with an apostrophe so Excel
 * treats it as text.
 */
function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) && !/^-?\d/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** Mirrors the `--paper*`/`--ink*`/`--moss*` custom properties in app/globals.css. */
const EXPORT_PALETTES = {
  paper: {
    bg: "#f2ead8",
    surface: "#faf5e9",
    surfaceAlt: "#e9dec6",
    border: "#d5c6a7",
    borderStrong: "#c6b592",
    text0: "#2b2922",
    text1: "#565044",
    text3: "#7b7262",
    text5: "#a39987",
    accent: "#55663a",
    accentSoft: "#dfe4c5",
  },
  night: {
    bg: "#24251e",
    surface: "#2d2e25",
    surfaceAlt: "#323329",
    border: "#444538",
    borderStrong: "#565545",
    text0: "#eee7d6",
    text1: "#c7bfae",
    text3: "#a39b89",
    text5: "#777565",
    accent: "#a5b67b",
    accentSoft: "#35402e",
  },
} as const;

/** Standalone stylesheet inlined into the HTML export, mirroring Brainworm's live palette. */
function htmlStyles(theme: Theme): string {
  const p = EXPORT_PALETTES[theme];
  return `
* { box-sizing: border-box; }
body {
  margin: 0; padding: 32px 16px;
  background: ${p.bg}; color: ${p.text0};
  font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
  font-size: 16px; line-height: 1.6;
}
.export-container { max-width: 820px; margin: 0 auto; }
.export-header { margin-bottom: 28px; padding-bottom: 16px; border-bottom: 1px solid ${p.border}; }
.export-header h1 { margin: 0 0 4px; font-size: 1.4rem; font-style: italic; }
.export-header .export-sub { color: ${p.text5}; font-size: 0.85rem; font-family: monospace; }
.chat { display: flex; flex-direction: column; gap: 20px; }
.message { display: flex; align-items: flex-start; gap: 12px; }
.avatar {
  width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; margin-top: 2px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 600; font-size: 0.78rem; color: ${p.bg}; background: ${p.accent};
}
.message.user .avatar { background: ${p.surfaceAlt}; color: ${p.text1}; }
.bubble { min-width: 0; flex: 1; }
.meta { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.sender { font-weight: 600; font-size: 0.85rem; color: ${p.text0}; }
.timestamp { font-size: 0.72rem; color: ${p.text5}; font-family: monospace; }
.content { overflow-wrap: break-word; word-break: break-word; color: ${p.text1}; font-family: Inter, system-ui, sans-serif; }
.content > :first-child { margin-top: 0; }
.content > :last-child { margin-bottom: 0; }
.content p { margin: 0 0 12px; }
.content h1, .content h2, .content h3, .content h4 { margin: 16px 0 8px; line-height: 1.3; color: ${p.text0}; }
.content ul, .content ol { margin: 8px 0 14px; padding-left: 24px; }
.content li { margin-bottom: 6px; }
.content li::marker { color: ${p.accent}; }
.content blockquote {
  margin: 14px 0; padding: 8px 16px; border-left: 3px solid ${p.accent};
  background: ${p.accentSoft}; color: ${p.text3}; border-radius: 0 8px 8px 0;
}
.content a { color: ${p.accent}; }
.content pre {
  background: #292b25; color: #e9e3d5; border: 1px solid ${p.borderStrong};
  padding: 15px 17px; border-radius: 11px; overflow-x: auto; margin: 17px 0;
}
.content pre code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 0.85rem; white-space: pre; }
.content code:not(pre code) {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 0.85em;
  padding: 2px 5px; border-radius: 5px; background: ${p.surfaceAlt}; border: 1px solid ${p.border};
}
.content .hljs-comment, .content .hljs-quote { color: #8f9487; font-style: italic; }
.content .hljs-keyword, .content .hljs-selector-tag, .content .hljs-literal, .content .hljs-type { color: #d99776; }
.content .hljs-title, .content .hljs-title.function_, .content .hljs-section { color: #d8c47c; }
.content .hljs-string, .content .hljs-attr, .content .hljs-template-tag, .content .hljs-template-variable { color: #a9c27f; }
.content .hljs-number, .content .hljs-symbol, .content .hljs-bullet, .content .hljs-variable, .content .hljs-variable.constant_ { color: #d9a960; }
.content .hljs-built_in, .content .hljs-name, .content .hljs-selector-class, .content .hljs-selector-id { color: #83b7ae; }
.content .hljs-meta, .content .hljs-doctag, .content .hljs-regexp, .content .hljs-link { color: #b6a2cf; }
.content .hljs-addition { color: #b8cf92; background: rgba(116, 150, 80, 0.14); }
.content .hljs-deletion { color: #e29a82; background: rgba(169, 88, 59, 0.16); }
.content table { width: 100%; border-collapse: collapse; margin: 10px 0 14px; }
.content th, .content td { border: 1px solid ${p.border}; padding: 8px 12px; text-align: left; vertical-align: top; }
.content thead th { background: ${p.surfaceAlt}; font-weight: 600; }
.content img { max-width: 100%; height: auto; border-radius: 8px; margin: 10px 0; }
.content .empty { color: ${p.text5}; }
.sources { margin-top: 12px; border: 1px solid ${p.border}; border-radius: 8px; background: ${p.surface}; padding: 8px 12px; }
.sources .sources-label { font-weight: 600; font-size: 0.8rem; color: ${p.text3}; }
.sources ol { margin: 8px 0 0; padding-left: 20px; font-size: 0.82rem; }
.sources a { color: ${p.accent}; }
.export-footer { margin-top: 28px; text-align: center; color: ${p.text5}; font-size: 0.78rem; }
`;
}

export const EXPORT_FORMATS: Record<ExportFormatKey, ExportFormat> = {
  txt: {
    key: "txt",
    label: "Plain text (.txt)",
    extension: "txt",
    mime: "text/plain",
    build(messages, includeSources, meta) {
      const sections = messages.map((msg) => {
        const lines = [`${msg.senderLabel}:`];
        if (msg.content) lines.push(msg.content);
        if (includeSources && msg.sources.length > 0) {
          lines.push(
            "Sources:",
            msg.sources.map((source) => `${source.title} — ${source.url}`).join("\n"),
          );
        }
        return lines.join("\n").trim();
      });
      return [`${meta.title} — exported ${meta.iso}`, ...sections]
        .filter(Boolean)
        .join("\n\n")
        .trim();
    },
  },
  md: {
    key: "md",
    label: "Markdown (.md)",
    extension: "md",
    mime: "text/markdown",
    build(messages, includeSources, meta) {
      const sections = messages.map((msg) => {
        const parts = [`### ${msg.senderLabel}`];
        if (msg.timestamp) parts.push(`*${msg.timestamp}*`);
        if (msg.content) parts.push(msg.content);
        if (includeSources && msg.sources.length > 0) {
          parts.push(
            "#### Sources",
            msg.sources
              .map((source, index) => `${index + 1}. [${source.title}](${source.url})`)
              .join("\n"),
          );
        }
        return parts.filter(Boolean).join("\n\n").trim();
      });
      return [`# ${meta.title}\n\n*Exported ${meta.iso}*`, ...sections]
        .filter(Boolean)
        .join("\n\n")
        .trim();
    },
  },
  html: {
    key: "html",
    label: "Web page (.html)",
    extension: "html",
    mime: "text/html",
    build(messages, includeSources, meta) {
      const body = messages
        .map((msg) => {
          const roleClass = msg.role === "user" ? "user" : "assistant";
          const initial = escapeHtml(
            (msg.senderLabel || "?").trim().charAt(0).toUpperCase() || "?",
          );
          const timestamp = msg.timestamp
            ? `<span class="timestamp">${escapeHtml(msg.timestamp)}</span>`
            : "";
          const content = msg.content
            ? renderMarkdown(msg.content)
            : '<p class="empty"><em>No content</em></p>';
          let sources = "";
          if (includeSources && msg.sources.length > 0) {
            const items = msg.sources
              .map(
                (source) =>
                  `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(source.title)}</a></li>`,
              )
              .join("");
            sources = `<div class="sources"><span class="sources-label">Sources</span><ol>${items}</ol></div>`;
          }
          return `        <article class="message ${roleClass}">
          <div class="avatar" aria-hidden="true">${initial}</div>
          <div class="bubble">
            <div class="meta"><span class="sender">${escapeHtml(msg.senderLabel)}</span>${timestamp}</div>
            <div class="content">${content}</div>
            ${sources}
          </div>
        </article>`;
        })
        .join("\n");
      return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(meta.title)}</title>
    <style>${htmlStyles(meta.theme)}</style>
  </head>
  <body>
    <div class="export-container">
      <header class="export-header">
        <h1>${escapeHtml(meta.title)}</h1>
        <div class="export-sub">Exported ${escapeHtml(meta.iso)}</div>
      </header>
      <main class="chat">
${body}
      </main>
      <footer class="export-footer">Exported from Brainworm</footer>
    </div>
  </body>
</html>`;
    },
  },
  json: {
    key: "json",
    label: "JSON (.json)",
    extension: "json",
    mime: "application/json",
    build(messages, includeSources, meta) {
      const payload = {
        title: meta.title,
        exportedAt: meta.iso,
        messages: messages.map((msg) => {
          const entry: Record<string, unknown> = {
            role: msg.role,
            sender: msg.senderLabel,
            content: msg.content,
            timestamp: msg.timestamp || undefined,
          };
          if (includeSources && msg.sources.length > 0) entry.sources = msg.sources;
          return entry;
        }),
      };
      return JSON.stringify(payload, null, 2);
    },
  },
  csv: {
    key: "csv",
    label: "Spreadsheet (.csv)",
    extension: "csv",
    mime: "text/csv",
    build(messages, includeSources) {
      const header = ["role", "sender", "content", "sources", "timestamp"];
      const rows = messages.map((msg) => [
        msg.role,
        msg.senderLabel,
        msg.content,
        includeSources && msg.sources.length > 0
          ? msg.sources.map((source) => `${source.title} (${source.url})`).join(" | ")
          : "",
        msg.timestamp || "",
      ]);
      return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    },
  },
};

/** The ordered list of formats, for building a picker. */
export const EXPORT_FORMAT_LIST: ExportFormat[] = ["md", "txt", "html", "json", "csv"].map(
  (key) => EXPORT_FORMATS[key as ExportFormatKey],
);

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "conversation";
}

/** Builds the export string for a conversation, or `null` if there is nothing to export. */
export function buildExportContent(
  convo: Conversation,
  formatKey: ExportFormatKey,
  includeSources: boolean,
  theme: Theme,
  iso: string = new Date().toISOString(),
): string | null {
  const format = EXPORT_FORMATS[formatKey];
  const messages = normaliseMessages(convo);
  if (!format || messages.length === 0) return null;
  return format.build(messages, includeSources, { iso, title: convo.title, theme });
}

/** Serializes a conversation in the given format and triggers a browser download. */
export function exportConversation(
  convo: Conversation,
  formatKey: ExportFormatKey,
  includeSources: boolean,
  theme: Theme,
): boolean {
  const iso = new Date().toISOString();
  const content = buildExportContent(convo, formatKey, includeSources, theme, iso);
  if (content === null) return false;

  const format = EXPORT_FORMATS[formatKey];
  const blob = new Blob([content], { type: format.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(convo.title)}-${iso.slice(0, 10)}.${format.extension}`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
