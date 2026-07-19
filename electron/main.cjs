const { app, BrowserWindow, clipboard, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const { fork } = require("node:child_process");

const TITLEBAR_HEIGHT = 36;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// Brainworm is a full Next.js app (API routes call x.ai server-side with the
// user's own key, see lib/xaiKey.ts), so