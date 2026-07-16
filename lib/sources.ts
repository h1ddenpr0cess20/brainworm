import type { Source } from "./types";

const MAX_SOURCES = 12;

/** Collects unique http(s) citation links found anywhere in an xAI response output tree. */
export function collectHttpSources(output: unknown): Source[] {
  if (!Array.isArray(output)) return [];
  const sources = new Map<string, Source>();

  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const url =
      typeof record.url === "string"
        ? record.url
        : typeof record.uri === "string"
          ? record.uri
          : null;
    if (url && /^https?:\/\//.test(url) && !sources.has(url)) {
      try {
        const hostname = new URL(url).hostname.replace(/^www\./, "");
        const title =
          typeof record.title === "string" && record.title.trim() ? record.title.trim() : hostname;
        sources.set(url, { title, url });
      } catch {
        // Skip strings that only look like links.
      }
    }
    for (const child of Object.values(record)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  };

  output.forEach(visit);
  return [...sources.values()].slice(0, MAX_SOURCES);
}
