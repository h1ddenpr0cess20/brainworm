const { app, BrowserWindow, clipboard, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const { fork } = require("node:child_process");

const TITLEBAR_HEIGHT = 36;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// Brainworm is a full Next.js app (API routes call x.ai server-side with the
// user's own key, see lib/xaiKey.ts), so unlike a static SPA it needs a real
// Node server running. We spawn the `next build` "standalone" output
// (next.config.ts sets output: "standalone" outside Vercel) as a child
// process on a loopback port and point the window at it, the same way
// Dockerfile runs `node server.js` in production.
const APP_ROOT = app.isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..");
const SERVER_PATH = path.join(APP_ROOT, ".next", "standalone", "server.js");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

let serverProcess = null;
let mainWindow = null;
let serverOrigin = null;

async function startServer() {
  if (!fs.existsSync(SERVER_PATH)) {
    throw new Error(`Standalone server not found at ${SERVER_PATH}. Run "npm run build" first.`);
  }

  const port = await getFreePort();
  serverProcess = fork(SERVER_PATH, [], {
    cwd: path.dirname(SERVER_PATH),
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });

  serverProcess.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  serverProcess.stderr?.on("data", (chunk) => process.stderr.write(chunk));

  serverOrigin = `http://127.0.0.1:${port}`;
  await waitForServer(`${serverOrigin}/api/health`, 15_000);
  return serverOrigin;
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
  serverProcess = null;
}

async function createWindow(origin) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 500,
    icon: path.join(__dirname, "icon.png"),
    backgroundColor: "#24251e",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#24251e",
      symbolColor: "#a5b67b",
      height: TITLEBAR_HEIGHT,
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`${origin}/`)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${origin}/`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  const ALLOWED_PERMISSIONS = new Set(["clipboard-read", "clipboard-sanitized-write"]);
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  mainWindow.webContents.session.setPermissionCheckHandler((_webContents, permission) =>
    ALLOWED_PERMISSIONS.has(permission),
  );

  mainWindow.webContents.session.on("will-download", (_event, item) => {
    item.setSavePath(path.join(app.getPath("downloads"), item.getFilename()));
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(`${origin}/`);
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  ipcMain.handle("titlebar:set-colors", (event, colors) => {
    if (process.platform === "darwin") return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !colors || !HEX_COLOR.test(colors.color) || !HEX_COLOR.test(colors.symbolColor)) {
      return;
    }
    try {
      win.setTitleBarOverlay({
        color: colors.color,
        symbolColor: colors.symbolColor,
        height: TITLEBAR_HEIGHT,
      });
    } catch {}
  });

  ipcMain.handle("clipboard:write-text", (_event, text) => {
    if (typeof text !== "string") {
      throw new TypeError("Clipboard text must be a string");
    }
    clipboard.writeText(text);
  });

  app.whenReady().then(async () => {
    try {
      const origin = await startServer();
      await createWindow(origin);
    } catch (err) {
      console.error(err.message);
      app.quit();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverOrigin) {
      await createWindow(serverOrigin);
    }
  });

  app.on("before-quit", stopServer);
  app.on("will-quit", stopServer);
}
