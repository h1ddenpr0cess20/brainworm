import { describe, expect, it } from "vitest";
import { isSupportedMcpUrl } from "./mcpUrl";

describe("MCP URL validation", () => {
  it("accepts HTTPS endpoints", () => {
    expect(isSupportedMcpUrl("https://mcp.example.com/mcp")).toBe(true);
  });

  it("accepts HTTP only for loopback endpoints", () => {
    expect(isSupportedMcpUrl("http://localhost:9620/mcp")).toBe(true);
    expect(isSupportedMcpUrl("http://models.localhost:9620/mcp")).toBe(true);
    expect(isSupportedMcpUrl("http://127.0.0.1:9620/mcp")).toBe(true);
    expect(isSupportedMcpUrl("http://127.12.34.56:9620/mcp")).toBe(true);
    expect(isSupportedMcpUrl("http://[::1]:9620/mcp")).toBe(true);
  });

  it("rejects remote HTTP and unsupported schemes", () => {
    expect(isSupportedMcpUrl("http://mcp.example.com/mcp")).toBe(false);
    expect(isSupportedMcpUrl("http://192.168.1.10:9620/mcp")).toBe(false);
    expect(isSupportedMcpUrl("ftp://localhost/mcp")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isSupportedMcpUrl("not a URL")).toBe(false);
  });
});
