import { describe, expect, it } from "vitest";
import type { McpServerConfig } from "@/lib/types";
import { buildMcpTools } from "./route";

const server: McpServerConfig = {
  id: "mcp-1",
  label: "my repo",
  url: "https://mcp.example.com/mcp",
  description: "Repository tools",
  authorization: "Bearer secret",
  readOnlyTools: ["read_file", "search_files"],
  allowedTools: ["read_file", "apply_patch", "run_tests"],
  enabled: true,
};

describe("user-configured MCP tools", () => {
  it("uses only the read-only allowlist in Normal and Plan", () => {
    for (const mode of ["normal", "plan"] as const) {
      expect(buildMcpTools([server], mode)).toEqual([
        {
          type: "mcp",
          server_url: server.url,
          server_label: "my_repo",
          server_description: server.description,
          authorization: server.authorization,
          allowed_tools: server.readOnlyTools,
        },
      ]);
    }
  });

  it("uses the explicit write-capable allowlist in Always-approve", () => {
    expect(buildMcpTools([server], "always")[0]?.allowed_tools).toEqual(server.allowedTools);
  });

  it("does not let disabled servers crowd enabled ones out of the cap", () => {
    const disabled = Array.from({ length: 8 }, (_, index) => ({
      ...server,
      id: `disabled-${index}`,
      enabled: false,
    }));
    expect(buildMcpTools([...disabled, server], "normal")).toHaveLength(1);
  });

  it("rejects insecure, disabled, duplicate, and unbounded servers", () => {
    expect(
      buildMcpTools(
        [
          { ...server, id: "http", url: "http://localhost:3000/mcp" },
          { ...server, id: "disabled", enabled: false },
          { ...server, id: "empty", label: "empty", readOnlyTools: [] },
          server,
          { ...server, id: "duplicate" },
        ],
        "normal",
      ),
    ).toHaveLength(1);
  });
});
