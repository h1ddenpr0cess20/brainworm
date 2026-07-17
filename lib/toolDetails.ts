import type { ResponseItem, ToolActivity } from "./types";

const MAX_FIELD_LENGTH = 400;

function truncate(text: string): string {
  return text.length > MAX_FIELD_LENGTH ? `${text.slice(0, MAX_FIELD_LENGTH)}…` : text;
}

function stringifyField(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value.trim() ? truncate(value) : null;
  try {
    return truncate(JSON.stringify(value));
  } catch {
    return null;
  }
}

export function findResponseItem(
  items: ResponseItem[] | undefined,
  toolId: string,
): ResponseItem | undefined {
  return items?.find((item) => item.id === toolId || item.call_id === toolId);
}

/** Builds a hover-friendly summary of a tool call from its raw response item, when one was captured. */
export function describeToolActivity(tool: ToolActivity, item: ResponseItem | undefined): string {
  const lines = [`${tool.name} · ${tool.status}`];
  if (!item) return lines.join("\n");

  const args = stringifyField(item.arguments ?? item.input);
  if (args) lines.push(`Arguments: ${args}`);

  const action = item.action;
  if (action && typeof action === "object") {
    const query = (action as Record<string, unknown>).query;
    if (typeof query === "string" && query.trim()) lines.push(`Query: ${truncate(query)}`);
  }

  const output = stringifyField(item.output ?? item.result);
  if (output) lines.push(`Output: ${output}`);

  const error = stringifyField(item.error);
  if (error) lines.push(`Error: ${error}`);

  return lines.join("\n");
}
