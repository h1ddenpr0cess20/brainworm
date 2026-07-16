import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Message } from "@/lib/types";
import { ChatMessage } from "./ChatMessage";

function assistantMessage(content: string): Message {
  return {
    id: "message-1",
    role: "assistant",
    content,
    createdAt: 0,
    status: "complete",
  };
}

describe("ChatMessage code blocks", () => {
  it("syntax-highlights fenced code and adds a copy control", () => {
    const markup = renderToStaticMarkup(
      <ChatMessage message={assistantMessage("```js\nconst answer = 42;\n```")} />,
    );

    expect(markup).toContain('class="hljs language-js"');
    expect(markup).toContain('class="hljs-keyword"');
    expect(markup).toContain('aria-label="Copy code"');
    expect(markup).toContain(">js</span>");
  });

  it("does not add a copy control to inline code", () => {
    const markup = renderToStaticMarkup(
      <ChatMessage message={assistantMessage("Use `const` inline.")} />,
    );

    expect(markup).not.toContain('aria-label="Copy code"');
  });
});
