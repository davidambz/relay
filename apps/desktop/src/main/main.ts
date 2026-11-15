// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, clipboard, desktopCapturer, ipcMain, Menu, nativeTheme, screen, session, shell } from "electron";
import type { CaptureSource, Theme } from "@relay/core";
import { IPC } from "../shared/api";
import { claimInstanceProfile } from "./instance";
import { storeGet, storeSet } from "./store";

const instanceNumber = claimInstanceProfile();
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;
// Picked in our own source picker; consumed by the display-media handler
// when the renderer calls getDisplayMedia().
let chosenSourceId: string | null = null;

function currentTheme(): Theme {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

function backgroundFor(theme: Theme) {
  // Matches --color-bg in tokens.css, so there's no white flash on open.
  return theme === "dark" ? "#111416" : "#e5e9ea";
}

async function listSources(): Promise<CaptureSource[]> {
  const ownId = mainWindow?.getMediaSourceId();
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 400, height: 225 },
    fetchWindowIcons: true,
  });
  return sources
    .filter((source) => source.id !== ownId)
    .map((source) => ({
      id: source.id,
      kind: source.id.startsWith("screen:") ? "screen" : "window",
      name: source.name,
      thumbnail: source.thumbnail.isEmpty() ? "" : source.thumbnail.toDataURL(),
      icon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : undefined,
    }));
}

function registerIpc() {
  ipcMain.handle(IPC.listSources, () => listSources());
  ipcMain.handle(IPC.chooseSource, (_event, id: unknown) => {
    if (typeof id !== "string") throw new Error("source id must be a string");
    chosenSourceId = id;
  });
  ipcMain.handle(IPC.getTheme, () => currentTheme());
  ipcMain.handle(IPC.getLocale, () => app.getPreferredSystemLanguages()[0] ?? app.getLocale());
  ipcMain.handle(IPC.storeGet, (_event, key: unknown) => (typeof key === "string" ? storeGet(key) : undefined));
  ipcMain.handle(IPC.storeSet, (_event, key: unknown, value: unknown) => {
    if (typeof key === "string") storeSet(key, value);
  });
  ipcMain.handle(IPC.copyText, (_event, text: unknown) => {
    if (typeof text !== "string" || text.length > 1000) throw new Error("copyText expects a short string");
    clipboard.writeText(text);
  });

  nativeTheme.on("updated", () => {
    const theme = currentTheme();
    for (const window of BrowserWindow.getAllWindows()) {
      window.setBackgroundColor(backgroundFor(theme));
      window.webContents.send(IPC.themeChanged, theme);
    }
  });
}

function registerDisplayMediaHandler() {
  // getDisplayMedia() in the renderer lands here instead of Chromium's
  // own picker: we hand back whatever source our picker chose. Audio is
  // deliberately not offered (Chromium's loopback would include Discord);
  // see the phase 2 audiocap helper in CLAUDE.md.
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
    const source = sources.find((candidate) => candidate.id === chosenSourceId);
    chosenSourceId = null;
    if (source) {
      callback({ video: source });
    } else {
      // Rejects the getDisplayMedia() promise (e.g. the window closed
      // between picking it and starting).
      callback({});
    }
  });
}

function createWindow() {
  const theme = currentTheme();
  const window = new BrowserWindow({
    ...devWindowPlacement(),
    width: 1120,
    height: 760,
    minWidth: 400,
    minHeight: 560,
    show: false,
    title: instanceNumber > 1 ? `Relay (${instanceNumber})` : "Relay",
    backgroundColor: backgroundFor(theme),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: "no-user-gesture-required",
      additionalArguments: [`--relay-version=${app.getVersion()}`, `--relay-instance=${instanceNumber}`],
    },
  });
  mainWindow = window;

  // Keep the instance number visible in the title even after the page sets <title>.
  window.on("page-title-updated", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  // No in-app navigation or popups yet (stage 4 opens the floating player
  // through setWindowOpenHandler). External links go to the browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!devServerUrl || !url.startsWith(devServerUrl)) event.preventDefault();
  });

  if (!app.isPackaged) {
    window.webContents.on("before-input-event", (_event, input) => {
      if (input.type === "keyDown" && input.key === "F12") window.webContents.toggleDevTools();
    });
  }

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(__dirname, "../dist-renderer/index.html"));
  }

  if (!app.isPackaged && process.env.RELAY_CAPTURE_PNG) {
    scheduleDevCapture(window, process.env.RELAY_CAPTURE_PNG, process.env.RELAY_DEV_SCRIPT);
  }
}

/**
 * Dev-only: RELAY_DEV_DISPLAY=secondary opens the window on a non-primary
 * monitor (or RELAY_DEV_DISPLAY=<index>), so automated test runs stay off
 * the screen someone is using. RELAY_DEV_OFFSET staggers several windows.
 */
function devWindowPlacement(): { x?: number; y?: number } {
  const wanted = app.isPackaged ? undefined : process.env.RELAY_DEV_DISPLAY;
  if (!wanted) return {};
  const displays = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;
  const display =
    wanted === "secondary" ? displays.find((candidate) => candidate.id !== primaryId) : displays[Number(wanted)];
  if (!display) return {};
  const offset = Number(process.env.RELAY_DEV_OFFSET ?? 0) || 0;
  return { x: display.workArea.x + 40 + offset, y: display.workArea.y + 40 + offset };
}

/**
 * Dev-only: optionally run a script in the page (its result is printed to
 * stdout), then save a screenshot of the window and quit. Lets the UI be checked from a terminal without
 * clicking through it by hand.
 */
function scheduleDevCapture(window: BrowserWindow, pngPath: string, script?: string) {
  window.webContents.once("did-finish-load", async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      if (script) {
        const result: unknown = await window.webContents.executeJavaScript(script, true);
        console.log("Dev script result:", result);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      // Stay up a while after the script (e.g. a broadcaster waiting for a
      // viewer started by the test harness), capturing at the end.
      const keepOpenMs = Number(process.env.RELAY_DEV_KEEP_OPEN_MS ?? 0) || 0;
      if (keepOpenMs > 0) await new Promise((resolve) => setTimeout(resolve, keepOpenMs));
      const image = await window.webContents.capturePage();
      fs.writeFileSync(pngPath, image.toPNG());
    } catch (error) {
      console.error("Dev capture failed", error);
      process.exitCode = 1;
    } finally {
      app.quit();
    }
  });
}

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  registerIpc();
  registerDisplayMediaHandler();
  createWindow();
});

app.on("window-all-closed", () => app.quit());
