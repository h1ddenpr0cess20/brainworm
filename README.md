# Brainworm

Brainworm is a bookish xAI workspace built with Next.js for Vercel. It adapts the compact rail, local thread library, manuscript-like feed, and responsive behavior of Darkwords into an earth-toned interface with three native xAI workspaces:

- **Chat** — streamed Grok 4.5 responses, reasoning effort, native web search, citations, and browser-local history.
- **Code** — Normal, Plan, and Always-approve modes; attached source context; user-configured HTTPS MCP workspaces; structured tool activity; and plan approval before implementation.
- **Imagine** — Grok Imagine generation and editing, fast or quality models, supported aspect ratios, 1K/2K output, local image persistence, and downloads.

Wordmark's xAI TTS and Grok Imagine implementations are the behavioral reference for voice playback, cache handling, generation/edit request shapes, and media persistence. Each reader supplies their own xAI API key; Brainworm sends provider calls through Next.js server routes without storing the key on the server.

## Safety and intended use

Brainworm is a creative and technical tool. It is **not intended for children**
and must not be used as a companion, friend, therapist, caregiver, or romantic
partner. AI output can be inaccurate, unsafe, or inappropriate; never rely on
Brainworm for crisis response, professional advice, or safety-critical
decisions.

Read the [AI Output Disclaimer and Conditions of Use](docs/ai-output-disclaimer.md)
and [Not a Companion](docs/not-a-companion.md) policy before using or deploying
the app. The [documentation index](docs/README.md) summarizes these boundaries.

## Run locally

Requires Node.js 22 or newer (`.nvmrc` is included).

```bash
npm install
npm run dev
```

Open Settings → Model and enter your xAI API key. The same user-supplied key powers Responses, TTS, voice discovery, and Imagine. It is saved only in that browser. `XAI_MODEL` is an optional server environment variable and defaults to `grok-4.5`.

## Deploy to Vercel

1. Import the repository into Vercel.
2. Deploy with the standard Next.js preset.
3. Add remote workspaces from Settings → Workspaces in the deployed app.

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

The user's xAI key, conversation metadata, and MCP definitions stay in that browser's `localStorage`. Credentials are sent only to Brainworm's same-origin chat route, which forwards them to xAI for that request without persisting them. Chat requests use `store: false`; generated images use IndexedDB, and synthesized voice clips use the browser Cache API.

## MCP workspace

Add up to eight remote HTTPS MCP servers under Settings → Workspaces. Each server has two exact tool allowlists:

- **Read-only tools** are exposed in Normal and Plan modes.
- **Always-approve tools** are exposed only after the user selects Always-approve or approves a plan for implementation.

An empty allowlist exposes no tools. Server labels are normalized and deduplicated, insecure URLs are rejected, and authorization headers remain browser-local between requests.

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
- [xAI Grok Build](https://github.com/xai-org/grok-build) — agent modes, plan approval, tool visibility, sessions, and permission workflow reference (Apache-2.0)
- [xAI Responses API](https://docs.x.ai/developers/model-capabilities/text/generate-text)
- [xAI Text to Speech](https://docs.x.ai/developers/model-capabilities/audio/text-to-speech)
- [xAI Image Generation](https://docs.x.ai/developers/model-capabilities/images/generation)
- [xAI Remote MCP](https://docs.x.ai/developers/tools/remote-mcp)
