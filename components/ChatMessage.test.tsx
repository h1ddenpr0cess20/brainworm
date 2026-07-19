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

  it("normalizes a scheme-less markdown link instead of resolving it against the app origin", () => {
    const markup = renderToStaticMarkup(
      <ChatMessage message={assistantMessage("See [the docs](example.com/guide) for more.")} />,
    );

    expect(markup).toContain('href="https://example.com/guide"');
  });

  it("renders tool activity and plan approval controls", () => {
    const message: Message = {
      ...assistantMessage("## Plan\n\nMake the change."),
      codeMode: "plan",
      planState: "proposed",
      tools: [{ id: "tool-1", name: "search_files", server: "repo", status: "complete" }],
    };
    const markup = renderToStaticMarkup(
      <ChatMessage
        message={message}
        onApprovePlan={() => undefined}
        onRequestPlanChanges={() => undefined}
      />,
    );

    expect(markup).toContain("repo · search_files");
    expect(markup).toContain("Approve and implement");
    expect(markup).toContain("Request changes");
  });

  it("surfaces tool arguments and output in a styled hover tooltip from the raw response item", () => {
    const message: Message = {
      ...assistantMessage("Read the config."),
      tools: [{ id: "tool-1", name: "read_file", server: "repo", status: "complete" }],
      responseItems: [
        {
          type: "mcp_call",
          id: "tool-1",
          name: "read_file",
          arguments: '{"path":"config.ts"}',
          output: "export const timeout = 300;",
        },
      ],
    };
    const markup = renderToStaticMarkup(<ChatMessage message={message} />);

    expect(markup).toContain("Arguments: {&quot;path&quot;:&quot;config.ts&quot;}");
    expect(markup).toContain("Output: export const timeout = 300;");
    expect(markup).toContain('role="tooltip"');
  });
});
