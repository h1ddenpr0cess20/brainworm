# Brainworm

Brainworm is a bookish xAI workspace built with Next.js for Vercel. It adapts the compact rail, local thread library, manuscript-like feed, and responsive behavior of Darkwords into an earth-toned interface with three native xAI workspaces:

- **Chat** — streamed Grok 4.5 responses, reasoning effort, native web search, citations, and browser-local history.
- **Code** — Grok Build-inspired Plan, Build, and Verify modes; attached source context; xAI code execution; and an optional remote MCP workspace with server-side tool allowlists.
- **Imagine** — Grok Imagine generation and editing, fast or quality models, supported aspect ratios, 1K/2K output, local image persistence, and downloads.

Wordmark's xAI TTS and Grok Imagine implementations are the behavioral reference for voice playback, cache handling, generation/edit request shapes, and media persistence. Each reader supplies their own xAI API key; Brainworm sends provider calls through Next.js server routes without storing the key on the server.

## Run locally

Requires Node.js 22 or newer (`.nvmrc` is included).

```bash
npm install
npm run dev
```

Open Settings → Model and enter your xAI API key. The same user-supplied key powers Responses, TTS, voice discovery, and Imagine. It is saved only in that browser. `XAI_MODEL` is an optional server environment variable and defaults to `grok-4.5`.

## Deploy to Vercel

1. Import the repository into Vercel.
2. Add the optional MCP variables from `.env.example` if Code mode should access a remote workspace.
3. Deploy with the standard Next.js preset.

`vercel.json` pins the install and build commands while each long-running API
route declares its own function duration. No deployment-wide xAI key is needed;
each user pays for their own xAI usage through the key they enter in Brainworm.

## Run with Docker

The production image uses Next.js standalone output and runs as an unprivileged
user. Runtime credentials are not included in the image.

```bash
cp .env.example .env.local
docker compose up --build
```

Open `http://localhost:3000`. The image exposes `/api/health` as its container
health check. Put a streaming-capable reverse proxy in front of the container
for a public self-hosted deployment.

The user's xAI key and conversation metadata stay in that browser's `localStorage`. The key is sent as a bearer credential only to Brainworm's same-origin API routes, which forward it to xAI for that request without persisting it. Chat requests use `store: false`; generated images use IndexedDB, and synthesized voice clips use the browser Cache API.

## MCP workspace

Brainworm connects xAI's Responses API to a remote HTTPS MCP server. Build receives only `BRAINWORM_MCP_ALLOWED_TOOLS`. Plan and Verify receive only `BRAINWORM_MCP_READONLY_TOOLS`. Because xAI's current remote-MCP contract does not expose per-call approval in Responses, explicit allowlists and the in-app **Arm MCP tools** switch are the permission boundary.

## Verification

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run audit
npm run build
```

Run the full local quality gate with `npm run check`. Use `npm run format` and
`npm run lint:fix` to apply safe automated fixes. GitHub Actions repeats the
quality gate, creates the production Next.js build, and verifies the Docker
image on every pull request and push to `main`.

## References

- Darkwords — product structure and responsive interaction reference
- Wordmark — xAI TTS and Grok Imagine behavior reference
- [xAI Grok Build](https://github.com/xai-org/grok-build) — Plan/Build/Verify workflow inspiration (Apache-2.0)
- [xAI Responses API](https://docs.x.ai/developers/model-capabilities/text/generate-text)
- [xAI Text to Speech](https://docs.x.ai/developers/model-capabilities/audio/text-to-speech)
- [xAI Image Generation](https://docs.x.ai/developers/model-capabilities/images/generation)
- [xAI Remote MCP](https://docs.x.ai/developers/tools/remote-mcp)
