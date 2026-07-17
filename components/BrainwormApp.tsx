"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  BrainwormSettings,
  Conversation,
  GeneratedImageRef,
  Message,
  MessageVariant,
  McpServerConfig,
  PersistedState,
  ReasoningEffort,
  ResponseItem,
  Source,
  ToolActivity,
  TtsVoice,
} from "@/lib/types";
import { makeConversationTitle } from "@/lib/prompt";
import { parseCodeCommand } from "@/lib/codeCommands";
import { readStreamEvents } from "@/lib/chatStream";
import { isTtsActive } from "@/lib/tts";
import {
  appendMessageVariant,
  branchFromMessage,
  selectMessageVariant as selectVariant,
  snapshotMessage,
} from "@/lib/conversations";
import { loadState, loadXaiApiKey, saveState, saveXaiApiKey } from "@/lib/storage";
import {
  base64ToBlob,
  clearImageBlobs,
  deleteImageBlob,
  loadImageBlob,
  saveImageBlob,
} from "@/lib/imageStorage";
import { autoplayTtsMessage, clearTtsCache, playTtsMessage, stopTtsMessage } from "@/lib/ttsClient";
import { collectGalleryItems } from "@/lib/gallery";
import { isDesktopApp, TITLEBAR_HEIGHT } from "@/lib/desktop";
import { BrainLogo } from "./BrainLogo";
import { ChatMessage } from "./ChatMessage";
import { DesktopTitlebar } from "./DesktopTitlebar";
import { GalleryPanel } from "./GalleryPanel";
import {
  CloseIcon,
  CodeIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  LibraryIcon,
  ImageIcon,
  MoonIcon,
  PlusIcon,
  PaperclipIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  SparkIcon,
  StopIcon,
  SunIcon,
  TrashIcon,
  VolumeIcon,
} from "./Icons";

type Panel = "history" | "settings" | null;
type LibraryTab = "threads" | "gallery";
type SettingsTab = "model" | "tools" | "voice" | "workspaces" | "theme" | "data";
type Health = {
  model: string;
};
type PendingFile = { name: string; content: string; size: number };
type PendingImage = { name: string; dataUrl: string };

const DEFAULT_SETTINGS: BrainwormSettings = {
  reasoningEffort: "medium",
  webSearch: false,
  theme: "paper",
  appMode: "chat",
  codeSessionMode: "normal",
  mcpServers: [],
  codeProjectBrief: "",
  ttsEnabled: false,
  ttsAutoplay: true,
  ttsVoice: "eve",
  ttsSpeed: 1,
  imagineModel: "grok-imagine-image-quality",
  imagineAspectRatio: "auto",
  imagineResolution: "1k",
  imagineCount: 1,
};

// Wordmark's current xAI catalog is the resilient fallback; the live API
// replaces it when /v1/tts/voices is available.
const WORDMARK_XAI_VOICES: TtsVoice[] = [
  "eve",
  "ara",
  "leo",
  "rex",
  "sal",
  "altair",
  "atlas",
  "carina",
  "castor",
  "celeste",
  "cosmo",
  "helios",
  "helix",
  "iris",
  "kepler",
  "lumen",
  "luna",
  "lux",
  "naksh",
  "orion",
  "perseus",
  "rigel",
  "sirius",
  "ursa",
  "zagan",
  "zenith",
].map((voiceId) => ({ voiceId, name: voiceId[0].toUpperCase() + voiceId.slice(1) }));

const STARTERS = [
  "Explain quantum entanglement using a clear everyday analogy",
  "Plan a two-week portfolio launch with 90 minutes per weekday",
  "Recommend five surreal novels under 300 pages",
  "Compare SQLite and PostgreSQL for a small SaaS app",
];

const CODE_STARTERS = [
  "Build a TypeScript debounce function with Vitest tests",
  "Fix this JavaScript bug: ['10', '2', '1'].sort() returns the wrong order",
  "Plan a REST API for a personal bookmark manager",
  "Secure an Express login endpoint against brute-force attacks",
];

const IMAGINE_STARTERS = [
  "A forgotten library grown into an ancient oak",
  "A friendly bookworm cartographer in a mossy archive",
  "An editorial collage about curiosity and deep thought",
  "A cinematic earth-toned study filled with strange books",
];

const IMAGINE_RATIOS = ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];

const CODE_COMMANDS = [
  { command: "/plan", description: "Explore read-only and propose a plan" },
  { command: "/normal", description: "Use the normal coding mode" },
  { command: "/always-approve", description: "Allow configured write tools" },
  { command: "/mcp", description: "Manage workspace MCP servers" },
  { command: "/effort", description: "Set low, medium, or high reasoning" },
  { command: "/search", description: "Toggle live web search" },
  { command: "/new", description: "Start a fresh coding session" },
];

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function parseCommaList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, 64);
}

function mergeTools(current: ToolActivity[] = [], incoming: ToolActivity[]): ToolActivity[] {
  const tools = new Map(current.map((tool) => [tool.id, tool]));
  for (const tool of incoming) {
    const existing = tools.get(tool.id);
    // A later event may omit the server label; keep the one already known.
    tools.set(tool.id, { ...existing, ...tool, server: tool.server ?? existing?.server });
  }
  return [...tools.values()];
}

/**
 * Flattens conversation history into the shape sent as `messages` in the
 * chat request body. Assistant turns that carry `responseItems` (mcp_call,
 * reasoning, message, …) replay those raw items instead of a synthesized
 * {role, content} turn, so the model keeps memory of prior tool calls and
 * results across turns.
 */
function buildConversationInput(messages: Message[]): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  for (const message of messages) {
    if (message.status !== "complete" || !message.content) continue;
    if (message.role === "assistant" && message.responseItems?.length) {
      items.push(...message.responseItems);
    } else {
      items.push({ role: message.role, content: message.content });
    }
  }
  return items;
}

function currentTimestamp(): number {
  return Date.now();
}

function codeModeLabel(mode: BrainwormSettings["codeSessionMode"]): string {
  return mode === "always" ? "Always-approve" : mode[0].toUpperCase() + mode.slice(1);
}

function makeConversation(): Conversation {
  const now = Date.now();
  return {
    id: makeId("thread"),
    title: "Fresh burrow",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

function makeInitialState(): PersistedState {
  const conversation = makeConversation();
  return {
    version: 1,
    activeConversationId: conversation.id,
    conversations: [conversation],
    settings: DEFAULT_SETTINGS,
  };
}

function repairPersistedState(saved: PersistedState): PersistedState {
  const savedSettings: Partial<BrainwormSettings> = saved.settings ?? {};
  const conversations = saved.conversations
    .filter((conversation) => conversation && Array.isArray(conversation.messages))
    .map((conversation) => ({
      ...conversation,
      messages: conversation.messages
        .filter((message) => message && (message.content || message.status !== "streaming"))
        .map((message) =>
          message.status === "streaming" ? { ...message, status: "complete" as const } : message,
        ),
    }));
  if (!conversations.length) return makeInitialState();
  const activeExists = conversations.some((item) => item.id === saved.activeConversationId);
  return {
    version: 1,
    activeConversationId: activeExists ? saved.activeConversationId : conversations[0].id,
    conversations,
    settings: {
      ...DEFAULT_SETTINGS,
      ...savedSettings,
      codeSessionMode:
        savedSettings.codeSessionMode === "plan" || savedSettings.codeSessionMode === "always"
          ? savedSettings.codeSessionMode
          : "normal",
      mcpServers: Array.isArray(savedSettings.mcpServers) ? savedSettings.mcpServers : [],
      codeProjectBrief:
        typeof savedSettings.codeProjectBrief === "string" ? savedSettings.codeProjectBrief : "",
    },
  };
}

export function BrainwormApp() {
  const [state, setState] = useState<PersistedState>(() => makeInitialState());
  const [hydrated, setHydrated] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("threads");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("model");
  const [input, setInput] = useState("");
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [ttsVoices, setTtsVoices] = useState<TtsVoice[]>(WORDMARK_XAI_VOICES);
  const [xaiApiKey, setXaiApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [effortMenuOpen, setEffortMenuOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeConversation =
    state.conversations.find((item) => item.id === state.activeConversationId) ??
    state.conversations[0];
  const hasXaiApiKey = Boolean(xaiApiKey.trim());
  const enabledMcpServers = state.settings.mcpServers.filter((server) => server.enabled);
  // Server configs carry authorization secrets; only Code requests need them,
  // and disabled servers should never leave the browser.
  const mcpServersForRequest = (appMode: BrainwormSettings["appMode"] = state.settings.appMode) =>
    appMode === "code" ? state.settings.mcpServers.filter((server) => server.enabled) : [];

  useEffect(() => {
    let cancelled = false;
    const saved = loadState();
    const savedApiKey = loadXaiApiKey();
    queueMicrotask(() => {
      if (cancelled) return;
      if (saved) {
        try {
          setState(repairPersistedState(saved));
        } catch {
          // A corrupt saved state must not keep the app stuck invisible.
        }
      }
      setXaiApiKey(savedApiKey);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const apiKey = xaiApiKey.trim();
    if (!apiKey) return;
    const controller = new AbortController();
    void fetch("/api/tts/voices", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
      .then((response) =>
        response.ok ? (response.json() as Promise<{ voices: TtsVoice[] }>) : null,
      )
      .then((payload) => {
        if (payload?.voices.length) setTtsVoices(payload.voices);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [xaiApiKey]);

  // Persisting serializes every conversation, so writing on each streamed
  // token is too heavy. Debounce writes, guarantee one at least every two
  // seconds while changes keep arriving, and flush when the page is hidden.
  const lastSaveRef = useRef(0);
  useEffect(() => {
    if (!hydrated) return;
    const save = () => {
      lastSaveRef.current = Date.now();
      saveState(state);
    };
    const overdue = Date.now() - lastSaveRef.current >= 2_000;
    const timer = window.setTimeout(save, overdue ? 0 : 400);
    const flush = () => {
      window.clearTimeout(timer);
      save();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", flush);
    };
  }, [hydrated, state]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
  }, [state.settings.theme]);

  useEffect(() => {
    void fetch("/api/health", { cache: "no-store" })
      .then((response) => response.json() as Promise<Health>)
      .then(setHealth)
      .catch(() =>
        setHealth({
          model: "grok-4.5",
        }),
      );
  }, []);

  const messageCount = activeConversation?.messages.length ?? 0;
  const lastContentLength = activeConversation?.messages.at(-1)?.content.length ?? 0;
  const lastToolCount = activeConversation?.messages.at(-1)?.tools?.length ?? 0;
  useEffect(() => {
    if (!messageCount) return;
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [activeConversation?.id, messageCount, lastContentLength, lastToolCount]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 176)}px`;
  }, [input]);

  const focusComposer = () => {
    // Focusing would pop the on-screen keyboard on touch devices; only
    // autofocus where a hardware pointer and keyboard are the norm.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const updateSettings = (patch: Partial<BrainwormSettings>) => {
    setState((current) => ({
      ...current,
      settings: { ...current.settings, ...patch },
    }));
  };

  const updateXaiApiKey = (apiKey: string) => {
    setXaiApiKey(apiKey);
    saveXaiApiKey(apiKey);
  };

  const setAppMode = (appMode: BrainwormSettings["appMode"]) => {
    updateSettings({ appMode });
    if (appMode === "code") stopTtsMessage();
    if (appMode !== "code") setPendingFiles([]);
    if (appMode !== "imagine") setPendingImage(null);
    setPanel(null);
    focusComposer();
  };

  const cycleCodeMode = () => {
    const order: BrainwormSettings["codeSessionMode"][] = ["normal", "plan", "always"];
    const currentIndex = order.indexOf(state.settings.codeSessionMode);
    updateSettings({ codeSessionMode: order[(currentIndex + 1) % order.length] });
  };

  const setTtsEnabled = (ttsEnabled: boolean) => {
    updateSettings({ ttsEnabled });
    if (!ttsEnabled) stopTtsMessage();
  };

  const addMcpServer = () => {
    const server: McpServerConfig = {
      id: makeId("mcp"),
      label: `workspace_${state.settings.mcpServers.length + 1}`,
      url: "",
      description: "Repository files, search, edits, and verification tools",
      authorization: "",
      allowedTools: [],
      readOnlyTools: [],
      enabled: true,
    };
    updateSettings({ mcpServers: [...state.settings.mcpServers, server] });
  };

  const updateMcpServer = (id: string, patch: Partial<McpServerConfig>) => {
    updateSettings({
      mcpServers: state.settings.mcpServers.map((server) =>
        server.id === id ? { ...server, ...patch } : server,
      ),
    });
  };

  const removeMcpServer = (id: string) => {
    updateSettings({
      mcpServers: state.settings.mcpServers.filter((server) => server.id !== id),
    });
  };

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const available = Math.max(0, 8 - pendingFiles.length);
    const selected = [...files].slice(0, available);
    const next: PendingFile[] = [];
    for (const file of selected) {
      if (file.size > 100_000) continue;
      next.push({ name: file.name, content: await file.text(), size: file.size });
    }
    setPendingFiles((current) => {
      const names = new Set(current.map((file) => file.name));
      return [...current, ...next.filter((file) => !names.has(file.name))].slice(0, 8);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const addImage = async (files: FileList | null) => {
    const file = files?.[0];
    if (
      !file ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 10_000_000
    )
      return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("Could not read the image."));
      reader.readAsDataURL(file);
    });
    setPendingImage({ name: file.name, dataUrl });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const newConversation = () => {
    abortRef.current?.abort();
    stopTtsMessage();
    const conversation = makeConversation();
    setState((current) => ({
      ...current,
      activeConversationId: conversation.id,
      conversations: [conversation, ...current.conversations],
    }));
    setStreamingMessageId(null);
    setPanel(null);
    setInput("");
    setPendingFiles([]);
    setPendingImage(null);
    focusComposer();
  };

  const selectConversation = (id: string) => {
    if (streamingMessageId) abortRef.current?.abort();
    stopTtsMessage();
    setState((current) => ({ ...current, activeConversationId: id }));
    setStreamingMessageId(null);
    setPendingImage(null);
    setPanel(null);
  };

  const deleteConversation = (id: string) => {
    const removed = state.conversations.find((conversation) => conversation.id === id);
    const retainedImageIds = new Set(
      state.conversations
        .filter((conversation) => conversation.id !== id)
        .flatMap((conversation) => conversation.messages)
        .flatMap((message) => message.images?.map((image) => image.id) ?? []),
    );
    const imageIds =
      removed?.messages
        .flatMap((message) => message.images?.map((image) => image.id) ?? [])
        .filter((imageId) => !retainedImageIds.has(imageId)) ?? [];
    void Promise.all(imageIds.map((imageId) => deleteImageBlob(imageId)));
    setState((current) => {
      const remaining = current.conversations.filter((item) => item.id !== id);
      if (!remaining.length) return makeInitialState();
      return {
        ...current,
        conversations: remaining,
        activeConversationId:
          current.activeConversationId === id ? remaining[0].id : current.activeConversationId,
      };
    });
  };

  const patchMessage = (conversationId: string, messageId: string, patch: Partial<Message>) => {
    setState((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              updatedAt: Date.now(),
              messages: conversation.messages.map((message) =>
                message.id === messageId ? { ...message, ...patch } : message,
              ),
            }
          : conversation,
      ),
    }));
  };

  const selectMessageVariant = (messageId: string, index: number) => {
    stopTtsMessage(messageId);
    setState((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === current.activeConversationId
          ? {
              ...conversation,
              messages: conversation.messages.map((message) => {
                if (message.id !== messageId) return message;
                return selectVariant(message, index);
              }),
            }
          : conversation,
      ),
    }));
  };

  const branchConversation = (messageId: string) => {
    if (!activeConversation || streamingMessageId) return;
    const branch = branchFromMessage(activeConversation, messageId, makeId);
    if (!branch) return;
    stopTtsMessage();
    setState((current) => ({
      ...current,
      activeConversationId: branch.id,
      conversations: [branch, ...current.conversations],
    }));
    setPanel(null);
    setInput("");
    setPendingFiles([]);
    setPendingImage(null);
    focusComposer();
  };

  const regenerateMessage = async (messageId: string) => {
    if (!activeConversation || streamingMessageId || state.settings.appMode === "imagine") return;
    if (!hasXaiApiKey) {
      setSettingsTab("model");
      setPanel("settings");
      return;
    }
    const messageIndex = activeConversation.messages.findIndex(
      (message) => message.id === messageId,
    );
    const target = activeConversation.messages[messageIndex];
    if (!target || target.role !== "assistant" || target.images?.length) return;

    const conversationId = activeConversation.id;
    const visibleSnapshot: MessageVariant = snapshotMessage(target);
    const variants = target.variants?.length ? target.variants : [visibleSnapshot];
    const restoreIndex = target.variants?.length
      ? Math.min(target.variantIndex ?? variants.length - 1, variants.length - 1)
      : 0;
    const requestMessages = buildConversationInput(
      activeConversation.messages.slice(0, messageIndex),
    );

    const regenAppMode = target.codeMode ? "code" : state.settings.appMode;
    const regenCodeMode = target.codeMode ?? state.settings.codeSessionMode;

    patchMessage(conversationId, messageId, {
      content: "",
      sources: undefined,
      responseItems: undefined,
      status: "streaming",
      variants,
      variantIndex: undefined,
    });
    setStreamingMessageId(messageId);
    stopTtsMessage(messageId);

    const abortController = new AbortController();
    abortRef.current = abortController;
    let accumulated = "";
    let streamedTools: ToolActivity[] = [];
    let finalSources: Source[] = [];
    let finalItems: ResponseItem[] = [];
    let completed = false;

    const finishVariant = (content: string, sources: Source[], responseItems: ResponseItem[]) => {
      setState((current) => ({
        ...current,
        conversations: current.conversations.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                updatedAt: Date.now(),
                messages: conversation.messages.map((message) => {
                  if (message.id !== messageId) return message;
                  return appendMessageVariant(message, { content, sources, responseItems });
                }),
              }
            : conversation,
        ),
      }));
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${xaiApiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: requestMessages,
          reasoningEffort: state.settings.reasoningEffort,
          webSearch: state.settings.webSearch,
          mode: regenAppMode,
          codeSessionMode: regenCodeMode,
          files: [],
          mcpServers: mcpServersForRequest(regenAppMode),
          projectBrief: regenAppMode === "code" ? state.settings.codeProjectBrief : undefined,
        }),
        signal: abortController.signal,
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `The request failed (${response.status}).`);
      }

      for await (const event of readStreamEvents(response.body)) {
        if (event.type === "delta") {
          accumulated += event.delta;
          patchMessage(conversationId, messageId, { content: accumulated });
        }
        if (event.type === "tool") {
          streamedTools = mergeTools(streamedTools, [event.tool]);
          patchMessage(conversationId, messageId, {
            tools: streamedTools,
          });
        }
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "done") {
          completed = true;
          finalSources = event.sources;
          finalItems = event.items;
          streamedTools = mergeTools(streamedTools, event.tools);
          patchMessage(conversationId, messageId, { tools: streamedTools });
        }
      }
      if (!completed) finalSources = [];
      if (!accumulated) {
        const restored = variants[restoreIndex] ?? visibleSnapshot;
        patchMessage(conversationId, messageId, {
          content: restored.content,
          sources: restored.sources,
          responseItems: restored.responseItems,
          status: "complete",
          variants,
          variantIndex: restoreIndex,
        });
        return;
      }
      finishVariant(accumulated, finalSources, finalItems);
      if (accumulated && isTtsActive(state.settings) && state.settings.ttsAutoplay) {
        void autoplayTtsMessage({
          messageId,
          text: accumulated,
          voice: state.settings.ttsVoice,
          speed: state.settings.ttsSpeed,
          apiKey: xaiApiKey.trim(),
        });
      }
    } catch {
      if (accumulated) {
        finishVariant(accumulated, finalSources, finalItems);
      } else {
        const restored = variants[restoreIndex] ?? visibleSnapshot;
        patchMessage(conversationId, messageId, {
          content: restored.content,
          sources: restored.sources,
          responseItems: restored.responseItems,
          status: abortController.signal.aborted ? "complete" : "error",
          variants,
          variantIndex: restoreIndex,
        });
      }
    } finally {
      abortRef.current = null;
      setStreamingMessageId(null);
    }
  };

  const attachLatestImage = async () => {
    const reference = [...(activeConversation?.messages ?? [])]
      .reverse()
      .flatMap((message) => [...(message.images ?? [])].reverse())[0];
    if (!reference) return;
    const blob = await loadImageBlob(reference.id);
    if (!blob) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("Could not load the image."));
      reader.readAsDataURL(blob);
    });
    setPendingImage({ name: `latest-${reference.id}`, dataUrl });
  };

  const generateImagine = async (prompt: string) => {
    if (!prompt || streamingMessageId || !activeConversation) return;
    if (!hasXaiApiKey) {
      setSettingsTab("model");
      setPanel("settings");
      return;
    }
    const now = currentTimestamp();
    const conversationId = activeConversation.id;
    const sourceImage = pendingImage;
    const imagineHistory = activeConversation.messages
      .filter(
        (message): message is Message & { role: "user" | "assistant" } =>
          (message.role === "user" || message.role === "assistant") &&
          message.status === "complete" &&
          Boolean(message.content.trim()),
      )
      .slice(-24)
      .map(({ role, content }) => ({ role, content }));
    const userMessage: Message = {
      id: makeId("user"),
      role: "user",
      content: prompt,
      createdAt: now,
      status: "complete",
      attachments: sourceImage ? [sourceImage.name] : undefined,
    };
    const assistantMessage: Message = {
      id: makeId("imagine"),
      role: "assistant",
      content: sourceImage
        ? "Editing the latest leaf with Grok Imagine…"
        : "Grok Imagine is sketching in the margins…",
      createdAt: now + 1,
      status: "streaming",
    };

    setInput("");
    setPendingImage(null);
    setStreamingMessageId(assistantMessage.id);
    setState((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              title:
                conversation.messages.length === 0
                  ? makeConversationTitle(prompt)
                  : conversation.title,
              updatedAt: now,
              messages: [...conversation.messages, userMessage, assistantMessage],
            }
          : conversation,
      ),
    }));

    const abortController = new AbortController();
    abortRef.current = abortController;
    try {
      const response = await fetch("/api/imagine", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${xaiApiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          model: state.settings.imagineModel,
          aspectRatio: state.settings.imagineAspectRatio,
          resolution: state.settings.imagineResolution,
          count: state.settings.imagineCount,
          sourceImage: sourceImage?.dataUrl,
          webSearch: state.settings.webSearch,
          reasoningEffort: state.settings.reasoningEffort,
          messages: imagineHistory,
        }),
        signal: abortController.signal,
      });
      const payload = (await response.json()) as {
        error?: string;
        images?: { b64: string; mimeType: string }[];
        model?: BrainwormSettings["imagineModel"];
        aspectRatio?: string;
        resolution?: "1k" | "2k";
        kind?: "generated" | "edited";
        usedPrompt?: string;
        sources?: Source[];
        tools?: ToolActivity[];
      };
      if (!response.ok || !payload.images?.length)
        throw new Error(payload.error || "Grok Imagine returned no images.");

      const images: GeneratedImageRef[] = await Promise.all(
        payload.images.map(async (image) => {
          const id = crypto.randomUUID();
          await saveImageBlob(id, base64ToBlob(image.b64, image.mimeType));
          return {
            id,
            prompt: payload.usedPrompt ?? prompt,
            mimeType: image.mimeType,
            model: payload.model ?? state.settings.imagineModel,
            aspectRatio: payload.aspectRatio ?? state.settings.imagineAspectRatio,
            resolution: payload.resolution ?? state.settings.imagineResolution,
            kind: payload.kind ?? (sourceImage ? "edited" : "generated"),
            createdAt: Date.now(),
          };
        }),
      );
      patchMessage(conversationId, assistantMessage.id, {
        content:
          images.length === 1
            ? "I found this image between the pages."
            : `I found ${images.length} variations between the pages.`,
        status: "complete",
        images,
        sources: payload.sources,
        tools: payload.tools,
      });
    } catch (error) {
      if (abortController.signal.aborted) {
        patchMessage(conversationId, assistantMessage.id, {
          content: "The sketch was set aside.",
          status: "complete",
        });
      } else {
        patchMessage(conversationId, assistantMessage.id, {
          content: `The image press jammed: ${error instanceof Error ? error.message : "Grok Imagine failed."}`,
          status: "error",
        });
      }
    } finally {
      abortRef.current = null;
      setStreamingMessageId(null);
    }
  };

  const sendMessage = async (
    textOverride?: string,
    codeModeOverride?: BrainwormSettings["codeSessionMode"],
  ) => {
    let text = (textOverride ?? input).trim();
    if (!text || streamingMessageId || !activeConversation) return;
    if (!hasXaiApiKey) {
      setSettingsTab("model");
      setPanel("settings");
      return;
    }

    if (state.settings.appMode === "imagine") {
      await generateImagine(text);
      return;
    }

    let requestCodeMode = codeModeOverride ?? state.settings.codeSessionMode;
    if (state.settings.appMode === "code" && text.startsWith("/")) {
      const action = parseCodeCommand(
        text,
        state.settings.codeSessionMode,
        state.settings.webSearch,
      );
      if (action?.type === "new") {
        newConversation();
        return;
      }
      if (action?.type === "search") {
        updateSettings({ webSearch: action.enabled });
        setInput("");
        return;
      }
      if (action?.type === "effort") {
        if (action.effort) updateSettings({ reasoningEffort: action.effort });
        setInput("");
        return;
      }
      if (action?.type === "mcp") {
        setSettingsTab("workspaces");
        setPanel("settings");
        setInput("");
        return;
      }
      if (action?.type === "mode") {
        requestCodeMode = action.mode;
        updateSettings({ codeSessionMode: requestCodeMode });
        if (!action.prompt) {
          setInput("");
          return;
        }
        text = action.prompt;
      }
      if (action?.type === "unknown") {
        setInput("");
        const notice: Message = {
          id: makeId("command"),
          role: "assistant",
          content: `Unknown Code command: \`${action.command}\`. Type \`/\` to see available commands.`,
          createdAt: currentTimestamp(),
          status: "error",
        };
        setState((current) => ({
          ...current,
          conversations: current.conversations.map((conversation) =>
            conversation.id === activeConversation.id
              ? { ...conversation, messages: [...conversation.messages, notice] }
              : conversation,
          ),
        }));
        return;
      }
    }

    const now = currentTimestamp();
    const conversationId = activeConversation.id;
    const userMessage: Message = {
      id: makeId("user"),
      role: "user",
      content: text,
      createdAt: now,
      status: "complete",
      attachments: pendingFiles.map((file) => file.name),
    };
    const assistantMessage: Message = {
      id: makeId("worm"),
      role: "assistant",
      content: "",
      createdAt: now + 1,
      status: "streaming",
      codeMode: state.settings.appMode === "code" ? requestCodeMode : undefined,
      planState:
        state.settings.appMode === "code" && requestCodeMode === "plan" ? "proposed" : undefined,
    };
    const requestMessages = [
      ...buildConversationInput(activeConversation.messages),
      { role: userMessage.role, content: userMessage.content },
    ];

    setInput("");
    const filesForRequest = pendingFiles;
    setPendingFiles([]);
    setStreamingMessageId(assistantMessage.id);
    setState((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              title:
                conversation.messages.length === 0
                  ? makeConversationTitle(text)
                  : conversation.title,
              updatedAt: now,
              messages: [...conversation.messages, userMessage, assistantMessage],
            }
          : conversation,
      ),
    }));

    const abortController = new AbortController();
    abortRef.current = abortController;
    let accumulated = "";
    let streamedTools: ToolActivity[] = [];

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${xaiApiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: requestMessages,
          reasoningEffort: state.settings.reasoningEffort,
          webSearch: state.settings.webSearch,
          mode: state.settings.appMode,
          codeSessionMode: requestCodeMode,
          files: filesForRequest.map(({ name, content }) => ({ name, content })),
          mcpServers: mcpServersForRequest(),
          projectBrief:
            state.settings.appMode === "code" ? state.settings.codeProjectBrief : undefined,
        }),
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `The request failed (${response.status}).`);
      }

      let completed = false;

      for await (const event of readStreamEvents(response.body)) {
        if (event.type === "delta") {
          accumulated += event.delta;
          patchMessage(conversationId, assistantMessage.id, { content: accumulated });
        }
        if (event.type === "tool") {
          streamedTools = mergeTools(streamedTools, [event.tool]);
          patchMessage(conversationId, assistantMessage.id, {
            tools: streamedTools,
          });
        }
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "done") {
          completed = true;
          streamedTools = mergeTools(streamedTools, event.tools);
          patchMessage(conversationId, assistantMessage.id, {
            status: "complete",
            sources: event.sources,
            tools: streamedTools,
            responseItems: event.items,
          });
        }
      }

      if (!completed) {
        patchMessage(conversationId, assistantMessage.id, {
          status: accumulated ? "complete" : "error",
          planState: undefined,
          content: accumulated || "The response stream ended before the agent completed its turn.",
        });
      }
      if (accumulated && isTtsActive(state.settings) && state.settings.ttsAutoplay) {
        void autoplayTtsMessage({
          messageId: assistantMessage.id,
          text: accumulated,
          voice: state.settings.ttsVoice,
          speed: state.settings.ttsSpeed,
          apiKey: xaiApiKey.trim(),
        });
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        if (accumulated) {
          patchMessage(conversationId, assistantMessage.id, {
            status: "complete",
            planState: undefined,
          });
        } else {
          setState((current) => ({
            ...current,
            conversations: current.conversations.map((conversation) =>
              conversation.id === conversationId
                ? {
                    ...conversation,
                    messages: conversation.messages.filter(
                      (message) => message.id !== assistantMessage.id,
                    ),
                  }
                : conversation,
            ),
          }));
        }
      } else {
        const message = error instanceof Error ? error.message : "Something went wrong.";
        patchMessage(conversationId, assistantMessage.id, {
          content: accumulated || `I hit a stone in the tunnel: ${message}`,
          status: accumulated ? "complete" : "error",
          planState: undefined,
        });
      }
    } finally {
      abortRef.current = null;
      setStreamingMessageId(null);
    }
  };

  const approvePlan = (messageId: string) => {
    if (streamingMessageId) return;
    patchMessage(activeConversation.id, messageId, { planState: "approved" });
    updateSettings({ codeSessionMode: "always" });
    void sendMessage("Implement the approved plan. Complete the work and verify it.", "always");
  };

  const requestPlanChanges = (messageId: string) => {
    if (streamingMessageId) return;
    patchMessage(activeConversation.id, messageId, { planState: "changes_requested" });
    updateSettings({ codeSessionMode: "plan" });
    setInput("Revise the plan: ");
    focusComposer();
  };

  const clearAll = () => {
    abortRef.current?.abort();
    stopTtsMessage();
    void clearImageBlobs();
    const conversation = makeConversation();
    setState((current) => ({
      version: 1,
      activeConversationId: conversation.id,
      conversations: [conversation],
      settings: current.settings,
    }));
    setPanel(null);
    setStreamingMessageId(null);
    setPendingImage(null);
  };

  const visibleHistory = useMemo(() => {
    const query = historyQuery.toLowerCase().trim();
    return [...state.conversations]
      .filter((conversation) => !query || conversation.title.toLowerCase().includes(query))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [historyQuery, state.conversations]);

  const galleryItems = useMemo(
    () => collectGalleryItems(state.conversations),
    [state.conversations],
  );

  const turns =
    activeConversation?.messages.filter((message) => message.role === "user").length ?? 0;

  return (
    <div
      className={`brainworm-app ${hydrated ? "is-ready" : ""} ${state.settings.appMode === "code" ? "is-code-mode" : state.settings.appMode === "imagine" ? "is-imagine-mode" : ""}`}
      style={
        isDesktopApp()
          ? ({
              paddingTop: TITLEBAR_HEIGHT,
              "--titlebar-height": `${TITLEBAR_HEIGHT}px`,
            } as CSSProperties)
          : undefined
      }
    >
      <DesktopTitlebar theme={state.settings.theme} />
      <aside className="rail" aria-label="Main navigation">
        <BrainLogo className="rail__logo" />
        <RailButton label="New thread" onClick={newConversation}>
          <PlusIcon />
        </RailButton>
        <RailButton
          label="My library"
          active={panel === "history"}
          onClick={() => setPanel((current) => (current === "history" ? null : "history"))}
        >
          <LibraryIcon />
        </RailButton>
        <RailButton
          label="Code grove"
          active={state.settings.appMode === "code"}
          onClick={() => setAppMode(state.settings.appMode === "code" ? "chat" : "code")}
        >
          <CodeIcon />
        </RailButton>
        <RailButton
          label="Imagine studio"
          active={state.settings.appMode === "imagine"}
          onClick={() => setAppMode(state.settings.appMode === "imagine" ? "chat" : "imagine")}
        >
          <ImageIcon />
        </RailButton>
        <div className="rail__spacer" />
        <RailButton
          label={state.settings.theme === "paper" ? "Switch to night soil" : "Switch to parchment"}
          onClick={() =>
            updateSettings({ theme: state.settings.theme === "paper" ? "night" : "paper" })
          }
        >
          {state.settings.theme === "paper" ? <MoonIcon /> : <SunIcon />}
        </RailButton>
        <RailButton
          label="Burrow setup"
          active={panel === "settings"}
          onClick={() => setPanel((current) => (current === "settings" ? null : "settings"))}
        >
          <SettingsIcon />
        </RailButton>
        <div
          className="rail__model-wrap"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              setEffortMenuOpen(false);
          }}
        >
          <button
            type="button"
            className="rail__model"
            aria-label={`Reasoning effort: ${effortLabel(state.settings.reasoningEffort)}`}
            aria-haspopup="menu"
            aria-expanded={effortMenuOpen}
            onClick={() => setEffortMenuOpen((current) => !current)}
          >
            {effortAbbr(state.settings.reasoningEffort)}
            {!effortMenuOpen && <span>Effort: {effortLabel(state.settings.reasoningEffort)}</span>}
          </button>
          {effortMenuOpen && (
            <div className="rail__model-menu" role="menu">
              {EFFORT_ORDER.map((effort) => (
                <button
                  key={effort}
                  type="button"
                  role="menuitem"
                  className={state.settings.reasoningEffort === effort ? "is-on" : ""}
                  onClick={() => {
                    updateSettings({ reasoningEffort: effort });
                    setEffortMenuOpen(false);
                  }}
                >
                  {effortLabel(effort)}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <BrainLogo className="topbar__mobile-logo" withWordmark />
          <div className="topbar__thread">
            <h1 title={activeConversation?.title ?? "Fresh burrow"}>
              {activeConversation?.title ?? "Fresh burrow"}
            </h1>
            <span>
              {turns} {turns === 1 ? "turn" : "turns"}
            </span>
            <span className="topbar__persona">
              {state.settings.appMode === "code"
                ? `Code mode · ${codeModeLabel(state.settings.codeSessionMode)}`
                : state.settings.appMode === "imagine"
                  ? "Imagine studio"
                  : "Bookworm mode"}
            </span>
          </div>
          <div className="topbar__mode-switch" aria-label="Workspace mode">
            <button
              className={state.settings.appMode === "chat" ? "is-on" : ""}
              onClick={() => setAppMode("chat")}
            >
              Chat
            </button>
            <button
              className={state.settings.appMode === "code" ? "is-on" : ""}
              onClick={() => setAppMode("code")}
            >
              <CodeIcon />
              Code
            </button>
            <button
              className={state.settings.appMode === "imagine" ? "is-on" : ""}
              onClick={() => setAppMode("imagine")}
            >
              <ImageIcon />
              Imagine
            </button>
          </div>
          <div className="topbar__status">
            {state.settings.webSearch && (
              <span>
                <SearchIcon />
                Surface scout on
              </span>
            )}
            {isTtsActive(state.settings) && (
              <span>
                <VolumeIcon />
                {state.settings.ttsVoice}
              </span>
            )}
            {state.settings.appMode === "code" && (
              <span>
                <CodeIcon />
                {codeModeLabel(state.settings.codeSessionMode)} mode
              </span>
            )}
            {state.settings.appMode === "imagine" && (
              <span>
                <ImageIcon />
                Grok Imagine
              </span>
            )}
            {state.settings.appMode === "code" && enabledMcpServers.length > 0 && (
              <span>
                <span className="connection-dot is-on" />
                {enabledMcpServers.length} MCP
              </span>
            )}
            <span className={`connection-dot ${hasXaiApiKey ? "is-on" : ""}`} />
            <span>{hasXaiApiKey ? "xAI den ready" : "Key needed"}</span>
          </div>
        </header>

        <div className="feed" ref={feedRef}>
          {activeConversation?.messages.length ? (
            <div className="feed__inner">
              {activeConversation.messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  busy={Boolean(streamingMessageId)}
                  onRegenerate={(messageId) => void regenerateMessage(messageId)}
                  onBranch={branchConversation}
                  onSelectVariant={selectMessageVariant}
                  onApprovePlan={approvePlan}
                  onRequestPlanChanges={requestPlanChanges}
                  tts={{
                    enabled: isTtsActive(state.settings),
                    voice: state.settings.ttsVoice,
                    speed: state.settings.ttsSpeed,
                    apiKey: xaiApiKey.trim(),
                  }}
                />
              ))}
            </div>
          ) : (
            <section
              className={`welcome ${state.settings.appMode === "code" ? "welcome--code" : state.settings.appMode === "imagine" ? "welcome--imagine" : ""}`}
            >
              <div className="welcome__art">
                <BrainLogo />
              </div>
              <p className="welcome__eyebrow">
                {state.settings.appMode === "code"
                  ? "Code grove · powered by Grok 4.5"
                  : state.settings.appMode === "imagine"
                    ? "Imagine studio · native xAI image generation"
                    : "A curious mind has many tunnels"}
              </p>
              <h2>
                {state.settings.appMode === "code"
                  ? "Trace the roots. Then change the tree."
                  : state.settings.appMode === "imagine"
                    ? "Picture what’s hiding between the pages."
                    : "A good question is a doorway."}
              </h2>
              <p className="welcome__copy">
                {state.settings.appMode === "code"
                  ? "Connect repository tools over MCP or attach source files. Normal and Plan stay read-only; Always-approve exposes only the write tools you explicitly allow."
                  : state.settings.appMode === "imagine"
                    ? "Generate with Grok Imagine or attach an image and describe the edit. Finished work stays in this browser’s local image library."
                    : "I’m Brainworm—part research companion, part margin scribbler. Bring me a knotty idea and we’ll dig until the roots show."}
              </p>
              <div className="welcome__starters">
                {(state.settings.appMode === "code"
                  ? CODE_STARTERS
                  : state.settings.appMode === "imagine"
                    ? IMAGINE_STARTERS
                    : STARTERS
                ).map((starter) => (
                  <button key={starter} onClick={() => void sendMessage(starter)}>
                    <span>{starter}</span>
                    <SparkIcon />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="composer-wrap">
          <div className="composer">
            {state.settings.appMode === "code" && (
              <div className="code-modebar">
                <div className="code-modebar__modes">
                  {(["normal", "plan", "always"] as const).map((mode) => (
                    <button
                      key={mode}
                      className={state.settings.codeSessionMode === mode ? "is-on" : ""}
                      onClick={() => updateSettings({ codeSessionMode: mode })}
                    >
                      {mode === "normal" ? (
                        <CodeIcon />
                      ) : mode === "always" ? (
                        <CheckIcon />
                      ) : (
                        <LibraryIcon />
                      )}
                      {codeModeLabel(mode)}
                    </button>
                  ))}
                </div>
                <span>Shift+Tab cycles modes</span>
              </div>
            )}
            {state.settings.appMode === "imagine" && (
              <div className="imagine-modebar">
                <label>
                  Model
                  <select
                    value={state.settings.imagineModel}
                    onChange={(event) =>
                      updateSettings({
                        imagineModel: event.target.value as BrainwormSettings["imagineModel"],
                      })
                    }
                  >
                    <option value="grok-imagine-image-quality">Quality</option>
                    <option value="grok-imagine-image">Fast</option>
                  </select>
                </label>
                <label>
                  Frame
                  <select
                    value={state.settings.imagineAspectRatio}
                    onChange={(event) => updateSettings({ imagineAspectRatio: event.target.value })}
                  >
                    {IMAGINE_RATIOS.map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Size
                  <select
                    value={state.settings.imagineResolution}
                    onChange={(event) =>
                      updateSettings({ imagineResolution: event.target.value as "1k" | "2k" })
                    }
                  >
                    <option value="1k">1K</option>
                    <option value="2k">2K</option>
                  </select>
                </label>
                <label>
                  Count
                  <select
                    value={state.settings.imagineCount}
                    onChange={(event) =>
                      updateSettings({ imagineCount: Number(event.target.value) })
                    }
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                  </select>
                </label>
              </div>
            )}
            {(pendingFiles.length > 0 || pendingImage) && (
              <div className="composer__files">
                {pendingFiles.map((file) => (
                  <span key={file.name}>
                    @{file.name}
                    <button
                      onClick={() =>
                        setPendingFiles((current) =>
                          current.filter((item) => item.name !== file.name),
                        )
                      }
                      aria-label={`Remove ${file.name}`}
                    >
                      <CloseIcon />
                    </button>
                  </span>
                ))}
                {pendingImage && (
                  <span>
                    @{pendingImage.name}
                    <button
                      onClick={() => setPendingImage(null)}
                      aria-label={`Remove ${pendingImage.name}`}
                    >
                      <CloseIcon />
                    </button>
                  </span>
                )}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              rows={1}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (state.settings.appMode === "code" && event.key === "Tab" && event.shiftKey) {
                  event.preventDefault();
                  cycleCodeMode();
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={
                state.settings.appMode === "code"
                  ? "Describe the task, attach code, or type /plan…"
                  : state.settings.appMode === "imagine"
                    ? pendingImage
                      ? "Describe how Grok Imagine should edit this image…"
                      : "Describe an image to unearth…"
                    : "Leave a thought at the mouth of the burrow…"
              }
              aria-label="Message Brainworm"
            />
            {state.settings.appMode === "code" &&
              input.startsWith("/") &&
              !input.slice(1).includes(" ") && (
                <div className="command-menu">
                  {CODE_COMMANDS.filter((item) => item.command.startsWith(input.toLowerCase())).map(
                    (item) => (
                      <button
                        key={item.command}
                        onClick={() => {
                          setInput(`${item.command} `);
                          textareaRef.current?.focus();
                        }}
                      >
                        <code>{item.command}</code>
                        <span>{item.description}</span>
                      </button>
                    ),
                  )}
                </div>
              )}
            <div className="composer__footer">
              <span>
                {state.settings.appMode === "code"
                  ? `${codeModeLabel(state.settings.codeSessionMode)} · `
                  : ""}
                {state.settings.appMode === "imagine"
                  ? `${state.settings.imagineModel.endsWith("quality") ? "quality" : "fast"} · ${state.settings.imagineAspectRatio} · `
                  : ""}
                {state.settings.reasoningEffort === "low"
                  ? "Nibble"
                  : state.settings.reasoningEffort === "medium"
                    ? "Dig"
                    : "Deep tunnel"}
                {state.settings.webSearch ? " · web search" : " · local context"}
                {isTtsActive(state.settings) ? ` · ${state.settings.ttsVoice} voice` : ""}
                {state.settings.appMode === "code" && enabledMcpServers.length > 0
                  ? ` · ${enabledMcpServers.length} MCP`
                  : ""}
              </span>
              {(state.settings.appMode === "code" || state.settings.appMode === "imagine") && (
                <>
                  <input
                    ref={fileInputRef}
                    className="visually-hidden"
                    type="file"
                    multiple={state.settings.appMode !== "imagine"}
                    accept={
                      state.settings.appMode === "imagine"
                        ? "image/png,image/jpeg,image/webp"
                        : "text/*,.js,.jsx,.ts,.tsx,.json,.css,.scss,.html,.md,.py,.rs,.go,.java,.c,.cpp,.h,.hpp,.rb,.php,.swift,.kt,.kts,.toml,.yaml,.yml,.sql,.sh"
                    }
                    onChange={(event) =>
                      state.settings.appMode === "imagine"
                        ? void addImage(event.target.files)
                        : void addFiles(event.target.files)
                    }
                  />
                  {state.settings.appMode === "imagine" &&
                    activeConversation?.messages.some((message) => message.images?.length) &&
                    !pendingImage && (
                      <button
                        className="composer__latest"
                        onClick={() => void attachLatestImage()}
                        aria-label="Edit latest image"
                      >
                        Latest
                      </button>
                    )}
                  <button
                    className="composer__attach"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label={
                      state.settings.appMode === "imagine"
                        ? "Attach an image to edit"
                        : "Attach source files"
                    }
                  >
                    <PaperclipIcon />
                  </button>
                </>
              )}
              {streamingMessageId ? (
                <button
                  className="composer__send is-stop"
                  onClick={() => abortRef.current?.abort()}
                  aria-label="Stop response"
                >
                  <StopIcon />
                </button>
              ) : (
                <button
                  className="composer__send"
                  onClick={() => void sendMessage()}
                  disabled={!input.trim()}
                  aria-label="Send message"
                >
                  <SendIcon />
                </button>
              )}
            </div>
          </div>
          <p className="composer-wrap__note">
            Brainworm can make mistakes. Check the roots before you climb the tree.
          </p>
        </div>
      </main>

      {panel && (
        <div
          className="panel-scrim"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setPanel(null);
          }}
        >
          <aside
            className="drawer"
            aria-label={panel === "history" ? "Conversation library" : "Settings"}
          >
            <div className="drawer__header">
              <div>
                <p>{panel === "history" ? "Your shelf" : "Fine-tune the worm"}</p>
                <h2>{panel === "history" ? "Library" : "Burrow setup"}</h2>
              </div>
              <button onClick={() => setPanel(null)} aria-label="Close panel">
                <CloseIcon />
              </button>
            </div>

            {panel === "history" && (
              <nav className="library-tabs" aria-label="Library sections">
                {(
                  [
                    ["threads", "Threads"],
                    ["gallery", "Gallery"],
                  ] as const
                ).map(([tab, label]) => (
                  <button
                    key={tab}
                    className={libraryTab === tab ? "is-active" : ""}
                    onClick={() => setLibraryTab(tab)}
                    aria-current={libraryTab === tab ? "page" : undefined}
                  >
                    {label}
                    {tab === "gallery" && galleryItems.length > 0 && (
                      <small>{galleryItems.length}</small>
                    )}
                  </button>
                ))}
              </nav>
            )}

            {panel === "history" && libraryTab === "gallery" ? (
              <div className="gallery-panel">
                <GalleryPanel items={galleryItems} />
              </div>
            ) : panel === "history" ? (
              <div className="history-panel">
                <label className="history-search">
                  <SearchIcon />
                  <input
                    value={historyQuery}
                    onChange={(event) => setHistoryQuery(event.target.value)}
                    placeholder="Search your threads"
                  />
                </label>
                <button className="new-thread-button" onClick={newConversation}>
                  <PlusIcon />
                  Start a fresh burrow
                </button>
                <div className="history-list">
                  {visibleHistory.map((conversation) => (
                    <div
                      className={`history-row ${conversation.id === activeConversation?.id ? "is-active" : ""}`}
                      key={conversation.id}
                    >
                      <button
                        className="history-row__select"
                        onClick={() => selectConversation(conversation.id)}
                      >
                        <span>{conversation.title}</span>
                        <small>
                          {
                            conversation.messages.filter((message) => message.role === "user")
                              .length
                          }{" "}
                          turns · {formatRelativeTime(conversation.updatedAt)}
                        </small>
                      </button>
                      <button
                        className="history-row__delete"
                        onClick={() => deleteConversation(conversation.id)}
                        aria-label={`Delete ${conversation.title}`}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="settings-shell">
                <nav className="settings-tabs" aria-label="Settings sections">
                  {(
                    [
                      ["model", "Model"],
                      ["tools", "Tools"],
                      ["voice", "Voice"],
                      ["workspaces", "Workspaces"],
                      ["theme", "Theme"],
                      ["data", "Data"],
                    ] as const
                  ).map(([tab, label]) => (
                    <button
                      key={tab}
                      className={settingsTab === tab ? "is-active" : ""}
                      onClick={() => setSettingsTab(tab)}
                      aria-current={settingsTab === tab ? "page" : undefined}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
                <div className="settings-panel">
                  {settingsTab === "model" && (
                    <>
                      <SettingSection
                        title="Connection"
                        description="Use your own xAI API key. It stays in this browser and is sent only through Brainworm's API routes to xAI."
                      >
                        <div className="connection-card">
                          <span className={`connection-dot ${hasXaiApiKey ? "is-on" : ""}`} />
                          <div>
                            <b>
                              {hasXaiApiKey ? "Your xAI key is ready" : "Your xAI key is required"}
                            </b>
                            <small>{health?.model ?? "grok-4.5"} · Responses API</small>
                          </div>
                        </div>
                        <label className="api-key-field">
                          <span>xAI API key</span>
                          <div>
                            <input
                              type={showApiKey ? "text" : "password"}
                              value={xaiApiKey}
                              onChange={(event) => updateXaiApiKey(event.target.value)}
                              placeholder="xai-…"
                              autoComplete="off"
                              autoCapitalize="none"
                              autoCorrect="off"
                              spellCheck={false}
                              aria-label="xAI API key"
                            />
                            <button
                              type="button"
                              className="api-key-field__toggle"
                              onClick={() => setShowApiKey((current) => !current)}
                              aria-label={showApiKey ? "Hide API key" : "Show API key"}
                              aria-pressed={showApiKey}
                            >
                              {showApiKey ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                            {hasXaiApiKey && (
                              <button type="button" onClick={() => updateXaiApiKey("")}>
                                Clear
                              </button>
                            )}
                          </div>
                          <small>Usage is billed to the xAI account that owns this key.</small>
                        </label>
                      </SettingSection>

                      <SettingSection
                        title="How deep should I dig?"
                        description="Grok 4.5 always reasons; this sets its effort level."
                      >
                        <div className="segmented">
                          {(["low", "medium", "high"] as const).map((effort) => (
                            <button
                              key={effort}
                              className={state.settings.reasoningEffort === effort ? "is-on" : ""}
                              onClick={() => updateSettings({ reasoningEffort: effort })}
                            >
                              {effort === "low" ? "Nibble" : effort === "medium" ? "Dig" : "Tunnel"}
                            </button>
                          ))}
                        </div>
                      </SettingSection>
                    </>
                  )}

                  {settingsTab === "tools" && (
                    <SettingSection
                      title="Surface scout"
                      description="Let xAI search the live web and return citation breadcrumbs."
                    >
                      <Toggle
                        checked={state.settings.webSearch}
                        onChange={(webSearch) => updateSettings({ webSearch })}
                        label="Use native web search"
                      />
                    </SettingSection>
                  )}

                  {settingsTab === "voice" && (
                    <SettingSection
                      title="Reading voice"
                      description="Wordmark-style xAI playback with local audio caching, autoplay, and per-message controls. Voice stays silent in Code mode so source code, terminal output, and secrets are never read aloud."
                    >
                      <Toggle
                        checked={state.settings.ttsEnabled}
                        onChange={setTtsEnabled}
                        label="Enable xAI text to speech"
                        disabled={!hasXaiApiKey}
                      />
                      {state.settings.ttsEnabled && (
                        <div className="voice-settings">
                          <label className="setting-select">
                            <span>Voice</span>
                            <select
                              value={state.settings.ttsVoice}
                              onChange={(event) => updateSettings({ ttsVoice: event.target.value })}
                            >
                              {!ttsVoices.some(
                                (voice) => voice.voiceId === state.settings.ttsVoice,
                              ) && (
                                <option value={state.settings.ttsVoice}>
                                  {state.settings.ttsVoice}
                                </option>
                              )}
                              {ttsVoices.map((voice) => (
                                <option key={voice.voiceId} value={voice.voiceId}>
                                  {voice.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <Toggle
                            checked={state.settings.ttsAutoplay}
                            onChange={(ttsAutoplay) => updateSettings({ ttsAutoplay })}
                            label="Autoplay new replies"
                          />
                          <label className="voice-speed">
                            <span>
                              Reading speed <b>{state.settings.ttsSpeed.toFixed(2)}×</b>
                            </span>
                            <input
                              type="range"
                              min="0.7"
                              max="1.5"
                              step="0.05"
                              value={state.settings.ttsSpeed}
                              onChange={(event) =>
                                updateSettings({ ttsSpeed: Number(event.target.value) })
                              }
                            />
                          </label>
                          <div className="voice-actions">
                            <button
                              onClick={() =>
                                void playTtsMessage({
                                  messageId: "voice-preview",
                                  text: "Brainworm reporting from the margins. The roots look interesting down here.",
                                  voice: state.settings.ttsVoice,
                                  speed: state.settings.ttsSpeed,
                                  apiKey: xaiApiKey.trim(),
                                })
                              }
                            >
                              <VolumeIcon />
                              Test voice
                            </button>
                            <button onClick={() => void clearTtsCache()}>
                              <TrashIcon />
                              Clear audio cache
                            </button>
                          </div>
                        </div>
                      )}
                    </SettingSection>
                  )}

                  {settingsTab === "workspaces" && (
                    <>
                      <SettingSection
                        title="Code grove"
                        description="Attach source context or connect HTTPS MCP servers that expose repository tools."
                      >
                        <Toggle
                          checked={state.settings.appMode === "code"}
                          onChange={(enabled) => setAppMode(enabled ? "code" : "chat")}
                          label="Enable coding workspace"
                        />
                        {state.settings.appMode === "code" && (
                          <>
                            <label className="project-brief-field">
                              <span>Project brief</span>
                              <textarea
                                defaultValue={state.settings.codeProjectBrief}
                                onBlur={(event) =>
                                  updateSettings({ codeProjectBrief: event.target.value })
                                }
                                placeholder="Stack, layout, conventions, and anything the agent shouldn't have to rediscover every task."
                                rows={3}
                                spellCheck={false}
                              />
                              <small>
                                Sent as standing orientation with every Code request, so the agent
                                doesn&apos;t have to explore from scratch each time.
                              </small>
                            </label>
                            <div className="mcp-list">
                              {state.settings.mcpServers.map((server) => (
                                <div className="mcp-editor" key={server.id}>
                                  <div className="mcp-editor__header">
                                    <Toggle
                                      checked={server.enabled}
                                      onChange={(enabled) =>
                                        updateMcpServer(server.id, { enabled })
                                      }
                                      label={server.label || "MCP server"}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeMcpServer(server.id)}
                                      aria-label={`Remove ${server.label || "MCP server"}`}
                                    >
                                      <TrashIcon />
                                    </button>
                                  </div>
                                  <div className="mcp-editor__grid">
                                    <label>
                                      <span>Label</span>
                                      <input
                                        value={server.label}
                                        onChange={(event) =>
                                          updateMcpServer(server.id, { label: event.target.value })
                                        }
                                        placeholder="workspace"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                      />
                                    </label>
                                    <label className="is-wide">
                                      <span>HTTPS MCP URL</span>
                                      <input
                                        type="url"
                                        value={server.url}
                                        onChange={(event) =>
                                          updateMcpServer(server.id, { url: event.target.value })
                                        }
                                        placeholder="https://mcp.example.com/mcp"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                      />
                                    </label>
                                    <label className="is-wide">
                                      <span>Description</span>
                                      <input
                                        value={server.description}
                                        onChange={(event) =>
                                          updateMcpServer(server.id, {
                                            description: event.target.value,
                                          })
                                        }
                                        placeholder="Repository and build tools"
                                      />
                                    </label>
                                    <label className="is-wide">
                                      <span>Authorization header</span>
                                      <input
                                        type="password"
                                        value={server.authorization}
                                        onChange={(event) =>
                                          updateMcpServer(server.id, {
                                            authorization: event.target.value,
                                          })
                                        }
                                        placeholder="Bearer …"
                                        autoComplete="off"
                                      />
                                    </label>
                                    <label className="is-wide">
                                      <span>Read-only tools</span>
                                      <input
                                        defaultValue={server.readOnlyTools.join(", ")}
                                        onBlur={(event) =>
                                          updateMcpServer(server.id, {
                                            readOnlyTools: parseCommaList(event.target.value),
                                          })
                                        }
                                        placeholder="read_file, list_files, search_files, git_diff"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                      />
                                      <small>Used in Normal and Plan modes.</small>
                                    </label>
                                    <label className="is-wide">
                                      <span>Always-approve tools</span>
                                      <input
                                        defaultValue={server.allowedTools.join(", ")}
                                        onBlur={(event) =>
                                          updateMcpServer(server.id, {
                                            allowedTools: parseCommaList(event.target.value),
                                          })
                                        }
                                        placeholder="read_file, apply_patch, run_tests"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                      />
                                      <small>
                                        Exact tool names; an empty list exposes nothing.
                                      </small>
                                    </label>
                                  </div>
                                  {server.url && !server.url.startsWith("https://") && (
                                    <p className="mcp-editor__error">MCP URLs must use HTTPS.</p>
                                  )}
                                </div>
                              ))}
                              <button
                                type="button"
                                className="mcp-add"
                                onClick={addMcpServer}
                                disabled={state.settings.mcpServers.length >= 8}
                              >
                                <PlusIcon />
                                Add MCP server
                              </button>
                            </div>
                            <div className="code-safety-note">
                              <CodeIcon />
                              <span>
                                Server definitions and credentials stay in this browser and are sent
                                through the same-origin chat route only for a Code request. Normal
                                and Plan expose the read-only list; Always-approve exposes the
                                explicit write-capable list.
                              </span>
                            </div>
                          </>
                        )}
                      </SettingSection>

                      <SettingSection
                        title="Imagine studio"
                        description="Native Grok Imagine generation and editing, adapted from Wordmark’s media tool flow."
                      >
                        <div className="imagine-setting-card">
                          <button onClick={() => setAppMode("imagine")}>
                            <ImageIcon />
                            Open Imagine studio
                          </button>
                          <span>
                            {state.settings.imagineModel.endsWith("quality") ? "Quality" : "Fast"} ·{" "}
                            {state.settings.imagineResolution.toUpperCase()} ·{" "}
                            {state.settings.imagineAspectRatio}
                          </span>
                        </div>
                      </SettingSection>
                    </>
                  )}

                  {settingsTab === "theme" && (
                    <SettingSection
                      title="Reading light"
                      description="Both palettes stay rooted in moss, clay, bark, and paper."
                    >
                      <div className="theme-choice">
                        <button
                          className={state.settings.theme === "paper" ? "is-on" : ""}
                          onClick={() => updateSettings({ theme: "paper" })}
                        >
                          <SunIcon />
                          Parchment
                        </button>
                        <button
                          className={state.settings.theme === "night" ? "is-on" : ""}
                          onClick={() => updateSettings({ theme: "night" })}
                        >
                          <MoonIcon />
                          Night soil
                        </button>
                      </div>
                    </SettingSection>
                  )}

                  {settingsTab === "data" && (
                    <SettingSection
                      title="Local library"
                      description="Threads are stored only in this browser. xAI storage is disabled for API calls."
                    >
                      <button className="danger-button" onClick={clearAll}>
                        <TrashIcon />
                        Clear every thread
                      </button>
                    </SettingSection>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button onClick={newConversation}>
          <PlusIcon />
          <span>New</span>
        </button>
        <button
          className={panel === "history" ? "is-active" : ""}
          onClick={() => setPanel((current) => (current === "history" ? null : "history"))}
        >
          <LibraryIcon />
          <span>Library</span>
        </button>
        <button
          className={state.settings.appMode === "code" ? "is-active" : ""}
          onClick={() => setAppMode(state.settings.appMode === "code" ? "chat" : "code")}
        >
          <CodeIcon />
          <span>Code</span>
        </button>
        <button
          className={state.settings.appMode === "imagine" ? "is-active" : ""}
          onClick={() => setAppMode(state.settings.appMode === "imagine" ? "chat" : "imagine")}
        >
          <ImageIcon />
          <span>Imagine</span>
        </button>
        <button
          className={panel === "settings" ? "is-active" : ""}
          onClick={() => setPanel((current) => (current === "settings" ? null : "settings"))}
        >
          <SettingsIcon />
          <span>Setup</span>
        </button>
      </nav>
    </div>
  );
}

const EFFORT_ORDER: ReasoningEffort[] = ["low", "medium", "high"];

function effortLabel(effort: ReasoningEffort): string {
  return effort === "low" ? "Nibble" : effort === "medium" ? "Dig" : "Deep tunnel";
}

function effortAbbr(effort: ReasoningEffort): string {
  return effort === "low" ? "Nib" : effort === "medium" ? "Dig" : "Tun";
}

function RailButton({
  children,
  label,
  active = false,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`rail__button ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-label={label}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

function SettingSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="setting-section">
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={`toggle-row ${disabled ? "is-disabled" : ""}`}>
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}

function formatRelativeTime(timestamp: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
