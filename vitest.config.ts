import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "lib/chatLinks.ts",
        "lib/compaction.ts",
        "lib/conversations.ts",
        "lib/messageQueue.ts",
        "lib/prompt.ts",
        "lib/sse.ts",
        "lib/tokenBudget.ts",
        "lib/tts.ts",
        "lib/xaiKey.ts",
      ],
      thresholds: {
        branches: 75,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
