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
  const [rawCommand, ...rest] = text.split(/\s+/);
  const command = rawCommand.toLowerCase();
  const remainder = rest.join(" ").trim();

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
