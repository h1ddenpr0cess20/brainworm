import { describe, expect, it } from "vitest";
import { buildExportContent, EXPORT_FORMAT_LIST, EXPORT_FORMATS } from "./conversationExport";
import type { Conversation, Message } from "./types";

const ISO = "2026-07-17T12:00:00.000Z";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "message-1",
    role: "user",
    content: "Hello there",
    createdAt: Date.UTC(2026, 0, 15, 9, 30),
    status: "complete",
    ...overrides,
  };
}

function makeConversation(messages: Message[], title = "New thread"): Conversation {
  return { id: "thread-1", title, createdAt: 0, updatedAt: 0, messages };
}

describe("EXPORT_FORMAT_LIST", () => {
  it("puts markdown first and mirrors EXPORT_FORMATS", () => {
    expect(EXPORT_FORMAT_LIST.map((format) => format.key)).toEqual([
      "md",
      "txt",
      "html",
      "json",
      "csv",
    ]);
    for (const format of EXPORT_FORMAT_LIST) {
      expect(EXPORT_FORMATS[format.key]).toBe(format);
    }
  });
});

describe("buildExportContent", () => {
  it("returns null when there is nothing worth exporting", () => {
    const convo = makeConversation([
      makeMessage({ id: "m1", status: "streaming", content: "" }),
      makeMessage({ id: "m2", content: "   " }),
    ]);
    expect(buildExportContent(convo, "txt", true, "paper", ISO)).toBeNull();
  });

  it("drops streaming and empty messages but keeps the rest", () => {
    const convo = makeConversation([
      makeMessage({ id: "m1", role: "user", content: "Question" }),
      makeMessage({ id: "m2", role: "assistant", content: "", status: "streaming" }),
    ]);
    const content = buildExportContent(convo, "txt", true, "paper", ISO)!;
    expect(content).toContain("Question");
    expect(content.match(/You:/g)).toHaveLength(1);
  });

  describe("txt format", () => {
    it("lists senders and content under a title/export header", () => {
      const convo = makeConversation(
        [
          makeMessage({ id: "m1", role: "user", content: "Hi" }),
          makeMessage({ id: "m2", role: "assistant", content: "Hello!" }),
        ],
        "Greeting thread",
      );
      const content = buildExportContent(convo, "txt", true, "paper", ISO)!;
      expect(content).toContain(`Greeting thread — exported ${ISO}`);
      expect(content).toContain("You:\nHi");
      expect(content).toContain("Brainworm:\nHello!");
    });

    it("includes sources only when requested", () => {
      const convo = makeConversation([
        makeMessage({
          role: "assistant",
          content: "See the docs",
          sources: [{ title: "Docs", url: "https://example.com" }],
        }),
      ]);
      const withSources = buildExportContent(convo, "txt", true, "paper", ISO)!;
      expect(withSources).toContain("Sources:");
      expect(withSources).toContain("Docs — https://example.com");

      const withoutSources = buildExportContent(convo, "txt", false, "paper", ISO)!;
      expect(withoutSources).not.toContain("Sources:");
    });
  });

  describe("md format", () => {
    it("uses a heading per sender and a title line", () => {
      const content = buildExportContent(
        makeConversation([makeMessage({ content: "Hi" })]),
        "md",
        true,
        "paper",
        ISO,
      )!;
      expect(content).toContain("# New thread");
      expect(content).toContain("### You");
      expect(content).toContain("Hi");
    });

    it("links sources as a markdown list", () => {
      const convo = makeConversation([
        makeMessage({
          role: "assistant",
          content: "See the docs",
          sources: [{ title: "Docs", url: "https://example.com" }],
        }),
      ]);
      const content = buildExportContent(convo, "md", true, "paper", ISO)!;
      expect(content).toContain("#### Sources");
      expect(content).toContain("1. [Docs](https://example.com)");
    });
  });

  describe("html format", () => {
    it("escapes the title and renders message markdown", () => {
      const convo = makeConversation(
        [makeMessage({ content: "**bold** text" })],
        "<script>alert(1)</script>",
      );
      const content = buildExportContent(convo, "html", true, "paper", ISO)!;
      expect(content).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(content).not.toContain("<script>alert(1)</script>");
      expect(content).toContain("<strong>bold</strong>");
    });

    it("syntax-highlights fenced code with the same highlighter as the live chat", () => {
      const convo = makeConversation([makeMessage({ content: "```js\nconst answer = 42;\n```" })]);
      const content = buildExportContent(convo, "html", true, "paper", ISO)!;
      expect(content).toContain('class="hljs language-js"');
      expect(content).toContain('class="hljs-keyword"');
    });

    it("bakes in the paper or night palette based on the active theme", () => {
      const convo = makeConversation([makeMessage({ content: "Hi" })]);
      const paper = buildExportContent(convo, "html", true, "paper", ISO)!;
      const night = buildExportContent(convo, "html", true, "night", ISO)!;
      expect(paper).toContain("#f2ead8");
      expect(night).toContain("#24251e");
      expect(paper).not.toContain("#24251e");
    });

    it("renders a sources block only when included", () => {
      const convo = makeConversation([
        makeMessage({
          role: "assistant",
          content: "See the docs",
          sources: [{ title: "Docs", url: "https://example.com" }],
        }),
      ]);
      const withSources = buildExportContent(convo, "html", true, "paper", ISO)!;
      expect(withSources).toContain('class="sources"');
      expect(withSources).toContain("https://example.com");

      const withoutSources = buildExportContent(convo, "html", false, "paper", ISO)!;
      expect(withoutSources).not.toContain('class="sources"');
    });
  });

  describe("json format", () => {
    it("serializes messages with optional sources", () => {
      const convo = makeConversation([
        makeMessage({ id: "m1", role: "user", content: "Hi" }),
        makeMessage({
          id: "m2",
          role: "assistant",
          content: "Hello",
          sources: [{ title: "Docs", url: "https://example.com" }],
        }),
      ]);
      const content = buildExportContent(convo, "json", true, "paper", ISO)!;
      const parsed = JSON.parse(content);

      expect(parsed.title).toBe("New thread");
      expect(parsed.exportedAt).toBe(ISO);
      expect(parsed.messages).toHaveLength(2);
      expect(parsed.messages[0]).toMatchObject({ role: "user", sender: "You", content: "Hi" });
      expect(parsed.messages[0].sources).toBeUndefined();
      expect(parsed.messages[1].sources).toEqual([{ title: "Docs", url: "https://example.com" }]);
    });
  });

  describe("csv format", () => {
    it("writes a quoted header and data row", () => {
      const content = buildExportContent(
        makeConversation([makeMessage({ content: "Hi" })]),
        "csv",
        true,
        "paper",
        ISO,
      )!;
      const [header, row] = content.split("\n");
      expect(header).toBe('"role","sender","content","sources","timestamp"');
      expect(row).toContain('"user"');
      expect(row).toContain('"Hi"');
    });

    it("guards against spreadsheet formula injection", () => {
      const content = buildExportContent(
        makeConversation([makeMessage({ content: "=SUM(A1:A9)" })]),
        "csv",
        true,
        "paper",
        ISO,
      )!;
      expect(content).toContain(`"'=SUM(A1:A9)"`);
    });

    it("does not guard numeric-looking negative values", () => {
      const content = buildExportContent(
        makeConversation([makeMessage({ content: "-42 is the answer" })]),
        "csv",
        true,
        "paper",
        ISO,
      )!;
      expect(content).toContain(`"-42 is the answer"`);
    });
  });
});
