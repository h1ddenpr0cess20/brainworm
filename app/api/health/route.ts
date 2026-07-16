export const dynamic = "force-dynamic";

export function GET(): Response {
  const hasMcpEndpoint = Boolean(
    process.env.BRAINWORM_MCP_URL?.startsWith("https://") && process.env.BRAINWORM_MCP_LABEL,
  );
  const hasBuildPolicy = Boolean(
    process.env.BRAINWORM_MCP_ALLOWED_TOOLS || process.env.BRAINWORM_MCP_ALLOW_ALL === "true",
  );
  return Response.json(
    {
      model: process.env.XAI_MODEL || "grok-4.5",
      mcpConfigured: hasMcpEndpoint && hasBuildPolicy,
      mcpLabel: hasMcpEndpoint ? process.env.BRAINWORM_MCP_LABEL : null,
      mcpReadOnlyConfigured: Boolean(hasMcpEndpoint && process.env.BRAINWORM_MCP_READONLY_TOOLS),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
