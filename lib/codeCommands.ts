import type { CodeSessionMode, ReasoningEffort } from "./types";

export type CodeCommandAction =
  | { type: "new" }
  | { type: "mcp" }
  | { type: "search"; enabled: boolean }
  | { type: "effort"; effort: ReasoningEffort | null }
  | { type: "mode"; mode: CodeSessionMode; prompt: string }
  | { type: "unknown"; command: string };

export function parseCodeCommand(
  input: string,
  currentMode: CodeSessionMode,
  webSearch: boolean,
): CodeCommandAction | null {
  const text = input.trim();
  if (!text.startsWith("/")) return null;
  const separator = text.search(/\s/);
  const rawCommand = separator === -1 ? text : text.slice(0, separator);
  const command = rawCommand.toLowerCase();
  // Keep the remainder verbatim so multi-line prompts after /plan survive.
  const remainder = separator === -1 ? "" : text.slice(separator).trim();

  if (command === "/new") return { type: "new" };
  if (command === "/mcp") return { type: "mcp" };
  if (command === "/search") {
    return {
      type: "search",
      enabled: remainder === "on" ? true : remainder === "off" ? false : !webSearch,
    };
  }
  if (command === "/effort") {
    return {
      type: "effort",
      effort:
        remainder === "low" || remainder === "medium" || remainder === "high" ? remainder : null,
    };
  }
  if (command === "/plan" || command === "/normal" || command === "/always-approve") {
    const mode: CodeSessionMode =
      command === "/plan"
        ? "plan"
        : command === "/normal"
          ? "normal"
          : currentMode === "always"
            ? "normal"
            : "always";
    return { type: "mode", mode, prompt: remainder };
  }
  return { type: "unknown", command };
}
