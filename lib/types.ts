export type MessageRole = "user" | "assistant";
export type MessageStatus = "complete" | "streaming" | "error";
export type ReasoningEffort = "low" | "medium" | "high";
export type Theme = "paper" | "night";
export type AppMode = "chat" | "code" | "imagine";
export type CodeSessionMode = "build" | "plan" | "verify";
export type ImagineModel = "grok-imagine-image" | "grok-imagine-image-quality";

export type Source = {
  title: string;
  url: string;
};

export type Message = {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  status: MessageStatus;
  sources?: Source[];
  attachments?: string[];
  images?: GeneratedImageRef[];
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
};

export type BrainwormSettings = {
  reasoningEffort: ReasoningEffort;
  webSearch: boolean;
  theme: Theme;
  appMode: AppMode;
  codeSessionMode: CodeSessionMode;
  mcpEnabled: boolean;
  ttsEnabled: boolean;
  ttsAutoplay: boolean;
  ttsVoice: string;
  ttsSpeed: number;
  imagineModel: ImagineModel;
  imagineAspectRatio: string;
  imagineResolution: "1k" | "2k";
  imagineCount: number;
};

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
  | { type: "done"; responseId?: string; sources: Source[] }
  | { type: "error"; message: string };
