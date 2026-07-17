// Next.js "standalone" output (see next.config.ts) doesn't include the static
// asset bundle or public/ directory — the docs ask you to copy them in
// yourself (see Dockerfile for the same steps used in the Docker image).
// electron/main.cjs spawns .next/standalone/server.js directly, so it needs
// those copied in before packaging or running the desktop app.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const STANDALONE = path.join(ROOT, ".next", "standalone");

function copyInto(src, destName) {
  const dest = path.join(STANDALONE, destName);
  if (!fs.existsSync(src)) return;
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

if (!fs.existsSync(STANDALONE)) {
  console.error(`No standalone build at ${STANDALONE}. Run "npm run build" first.`);
  process.exit(1);
}

copyInto(path.join(ROOT, ".next", "static"), path.join(".next", "static"));
copyInto(path.join(ROOT, "public"), "public");

console.log("Copied .next/static and public/ into .next/standalone.");
