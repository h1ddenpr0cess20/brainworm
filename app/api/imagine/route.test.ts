import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("Imagine API orchestration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("researches the request and passes the grounded prompt to Grok Imagine", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          output: [
            {
              type: "web_search_call",
              id: "search_1",
              status: "completed",
              action: {
                sources: [
                  {
                    title: "Official mission reference",
                    url: "https://example.com/mission",
                  },
                ],
              },
            },
            {
              type: "function_call",
              call_id: "imagine_1",
              name: "grok_generate_image",
              arguments: JSON.stringify({
                prompt: "A researched and accurate Artemis II editorial poster",
              }),
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: [{ b64_json: "aW1hZ2U=", mime_type: "image/png" }] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("https://brainworm.test/api/imagine", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: "Make an Artemis II poster",
          webSearch: true,
          reasoningEffort: "high",
          messages: [{ role: "assistant", content: "Use a restrained editorial style." }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.x.ai/v1/responses");
    const agentRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(agentRequest.reasoning).toEqual({ effort: "high" });
    expect(agentRequest.tools.map((tool: { type: string }) => tool.type)).toEqual([
      "web_search",
      "x_search",
      "function",
    ]);

    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.x.ai/v1/images/generations");
    const imageRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(imageRequest.prompt).toBe("A researched and accurate Artemis II editorial poster");

    await expect(response.json()).resolves.toMatchObject({
      images: [{ b64: "aW1hZ2U=", mimeType: "image/png" }],
      usedPrompt: "A researched and accurate Artemis II editorial poster",
      sources: [{ title: "Official mission reference", url: "https://example.com/mission" }],
      tools: [
        { id: "search_1", name: "Web search", status: "complete" },
        { id: "imagine_1", name: "Grok Imagine generate", status: "complete" },
      ],
    });
  });
});
