export type MessageRole = "user" | "assistant";
export type MessageStatus = "complete" | "streaming" | "error";
export type ReasoningEffort = "low" | "medium" | "high";
export type Theme = "paper" | "night";
export type AppMode = "chat" | "code" | "imagine";
export type CodeSessionMode = "normal" | "plan" | "always";
export type ImagineModel = "grok-imagine-image" | "grok-imagine-image-quality";

export type McpServerConfig = {
  id: string;
  label: string;
  url: string;
  description: string;
  authorization: string;
  allowedTools: string[];
  readOnlyTools: string[];
  enabled: boolean;
};

export type ToolActivity = {
  id: string;
  name: string;
  server?: string;
  status: "running" | "complete" | "error";
};

export type Source = {
  title: string;
  url: string;
};

export type MessageVariant = {
  content: string;
  sources?: Source[];
  responseItems?: ResponseItem[];
  // Ride along so switching variants restores this reply's own plan state,
  // instead of showing approve/revise buttons meant for a different variant.
  codeMode?: CodeSessionMode;
  planState?: "proposed" | "approved" | "changes_requested";
};

/** A raw item from xAI's Responses API `output` array, replayed verbatim on later turns. */
export type ResponseItem = Record<string, unknown>;

export type Message = {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  status: MessageStatus;
  sources?: Source[];
  attachments?: string[];
  images?: GeneratedImageRef[];
  codeMode?: CodeSessionMode;
  planState?: "proposed" | "approved" | "changes_requested";
  tools?: ToolActivity[];
  responseItems?: ResponseItem[];
  /** Every completed version of a regenerated assistant reply, oldest first. */
  variants?: MessageVariant[];
  variantIndex?: number;
  // UI-only status line (compaction confirmations, queue feedback). Rendered
  // in the transcript but never sent to xAI and never counted toward the
  // history token budget.
  notice?: boolean;
};

export type GeneratedImageRef = {
  id: string;
  prompt: string;
  mimeType: string;
  model: ImagineModel;
  aspectRatio: string;
  resolution: "1k" | "2k";
  kind: "generated" | "edited";
  createdAt: number;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  // A running summary that replaces older turns in the request history (see
  // lib/compaction.ts). `compactedThroughId` is the id of the last message
  // already folded into `compactedSummary`.
  compactedSummary?: string;
  compactedThroughId?: string;
};

export type BrainwormSettings = {
  reasoningEffort: ReasoningEffort;
  webSearch: boolean;
  theme: Theme;
  appMode: AppMode;
  codeSessionMode: CodeSessionMode;
  mcpServers: McpServerConfig[];
  codeProjectBrief: string;
  ttsEnabled: boolean;
  ttsAutoplay: boolean;
  ttsVoice: string;
  ttsSpeed: number;
  imagineModel: ImagineModel;
  imagineAspectRatio: string;
  imagineResolution: "1k" | "2k";
  imagineCount: number;
  // When a conversation nears its history token budget, summarize older
  // turns (lib/compaction.ts) instead of letting the server-side message cap
  // silently drop them.
  autoCompact: boolean;
};

export type PendingFile = { name: string; content: string; size: number };
export type PendingImage = { name: string; dataUrl: string };

export type TtsVoice = {
  voiceId: string;
  name: string;
  description?: string;
};

export type PersistedState = {
  version: 1;
  activeConversationId: string;
  conversations: Conversation[];
  settings: BrainwormSettings;
};

export type StreamEvent =
  | { type: "delta"; delta: string }
  | { type: "tool"; tool: ToolActivity }
  | {
      type: "done";
      responseId?: string;
      sources: Source[];
      tools: ToolActivity[];
      items: ResponseItem[];
    }
  | { type: "error"; message: string };
