import { collectHttpSources } from "./sources";
import type { Source, ToolActivity } from "./types";

export type ImagineFunctionCall = {
  id: string;
  name: "grok_generate_image" | "grok_edit_image";
  prompt: string;
};

type ImagineAgentOptions = {
  edit: boolean;
  webSearch: boolean;
};

export const IMAGINE_AGENT_PROMPT = `You orchestrate image generation and editing.

Call the available Grok Imagine function exactly once for every user request. Put the complete, production-ready visual description in its prompt argument while preserving the user's intent.

When web or X search tools are available, use them first whenever current facts, a real person/place/product/event, or accurate reference details would improve the image. Incorporate useful findings into the image prompt. Do not claim to generate the image yourself and do not finish with a text-only answer.`;

export function buildImagineAgentTools({ edit, webSearch }: ImagineAgentOptions) {
  const functionName = edit ? "grok_edit_image" : "grok_generate_image";
  return [
    ...(webSearch
      ? [
          {
            type: "web_search",
            enable_video_understanding: true,
            enable_image_understanding: true,
          },
          {
            type: "x_search",
            enable_video_understanding: true,
            enable_image_understanding: true,
          },
        ]
      : []),
    {
      type: "function",
      name: functionName,
      description: edit
        ? "Edit the user's attached image with Grok Imagine."
        : "Generate an image with Grok Imagine.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "A detailed, self-contained description of the image to create.",
          },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
      strict: true,
    },
  ];
}

export function extractImagineFunctionCall(
  output: unknown,
  edit: boolean,
): ImagineFunctionCall | null {
  if (!Array.isArray(output)) return null;
  const expectedName = edit ? "grok_edit_image" : "grok_generate_image";
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (record.type !== "function_call" || record.name !== expectedName) continue;
    let args: unknown;
    try {
      args = typeof record.arguments === "string" ? JSON.parse(record.arguments) : record.arguments;
    } catch {
      continue;
    }
    if (!args || typeof args !== "object") continue;
    const prompt = (args as Record<string, unknown>).prompt;
    if (typeof prompt !== "string" || !prompt.trim()) continue;
    return {
      id:
        typeof record.call_id === "string"
          ? record.call_id
          : typeof record.id === "string"
            ? record.id
            : "grok_imagine",
      name: expectedName,
      prompt: prompt.trim().slice(0, 8_000),
    };
  }
  return null;
}

export function extractImagineSources(output: unknown): Source[] {
  return collectHttpSources(output);
}

export function extractImagineTools(
  output: unknown,
  call: ImagineFunctionCall | null,
): ToolActivity[] {
  const tools: ToolActivity[] = [];
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const type = typeof record.type === "string" ? record.type : "";
      if (type !== "web_search_call" && type !== "x_search_call") continue;
      tools.push({
        id: typeof record.id === "string" ? record.id : `${type}_${tools.length}`,
        name: type === "web_search_call" ? "Web search" : "X search",
        status: record.status === "failed" ? "error" : "complete",
      });
    }
  }
  if (call) {
    tools.push({
      id: call.id,
      name: call.name === "grok_edit_image" ? "Grok Imagine edit" : "Grok Imagine generate",
      status: "complete",
    });
  }
  return tools;
}
