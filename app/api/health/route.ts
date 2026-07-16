export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    {
      model: process.env.XAI_MODEL || "grok-4.5",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
