// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, clipboard, desktopCapturer, ipcMain, Menu, nativeTheme, screen, session, shell } from "electron";
import type { CaptureSource, SessionKind, Theme } from "@relay/core";
import { IPC } from "../shared/api";
import { claimInstanceProfile } from "./instance";
import { storeGet, storeSet } from "./store";
import { hwndFromSourceId, listOpenWindows } from "./windowList";
import { isAudioAvailable, startAudio, stopAllAudio, stopAudio } from "./audio";
import { applyUpdate, checkForUpdate, getUpdateStatus, installOnQuit, scheduleUpdateChecks, setSessionActive } from "./updater";
import { createTray, type RelayTray } from "./tray";

// null: an installed Relay is already running; it gets "second-instance"
// and shows itself, and this copy just quits.
const instanceNumber = claimInstanceProfile();
if (instanceNumber === null) app.quit();
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;
// The viewer's mini player, while open (it stands in for the main window).
let floatingWindow: BrowserWindow | null = null;
let tray: RelayTray | null = null;
let currentSession: SessionKind | null = null;
// Quitting for real (vs. the window's X, which hides to the tray).
let quitting = false;
// Quitting while broadcasting was confirmed (or doesn't need asking).
let quitApproved = false;
const HINT_KEY = "tray.hintShown";
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
  const [sources, openWindows] = await Promise.all([
    desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 400, height: 225 },
      fetchWindowIcons: true,
    }),
    listOpenWindows(),
  ]);
  const openHwnds = openWindows ? new Set(openWindows.map((window) => window.hwnd)) : null;
  const isOpenWindow = (id: string) => {
    if (!openHwnds) return true;
    const hwnd = hwndFromSourceId(id);
    return hwnd !== null && openHwnds.has(hwnd);
  };
  return sources
    .filter((source) => source.id !== ownId)
    .filter((source) => source.id.startsWith("screen:") || isOpenWindow(source.id))
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
  ipcMain.handle(IPC.audioStart, async (event, sourceId: unknown) => {
    if (typeof sourceId !== "string") throw new Error("sourceId must be a string");
    const { id, mode } = await startAudio(event.sender, sourceId);
    console.log("System audio:", mode.kind, "pid" in mode ? mode.pid : "");
    return id;
  });
  ipcMain.handle(IPC.audioStop, (event, captureId: unknown) =>
    stopAudio(event.sender.id, typeof captureId === "number" ? captureId : undefined),
  );
  ipcMain.handle(IPC.updateGetStatus, () => getUpdateStatus());
  ipcMain.handle(IPC.updateCheck, async () => {
    await checkForUpdate();
  });
  ipcMain.handle(IPC.updateApply, () => applyUpdate());
  ipcMain.on(IPC.quitAnswer, (_event, confirmed: unknown) => {
    confirmingQuit = false;
    if (confirmed !== true) return;
    quitApproved = true;
    app.quit();
  });
  ipcMain.on(IPC.session, (_event, value: unknown) => {
    currentSession = value === "broadcasting" || value === "watching" ? value : null;
    setSessionActive(currentSession !== null);
    tray?.setSession(currentSession);
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

// What the renderer legitimately asks Chromium for: fullscreen (the
// player; "automatic-fullscreen" keeps it working when the request isn't
// tied to a fresh gesture, as before these handlers existed), media
// (display capture, routed to the handler below) and writing to the
// clipboard. Electron grants every permission by default; everything
// else is denied.
const ALLOWED_PERMISSIONS = new Set([
  "fullscreen",
  "automatic-fullscreen",
  "media",
  "display-capture",
  "clipboard-sanitized-write",
]);

function registerPermissionHandlers() {
  const allowed = (permission: string) => ALLOWED_PERMISSIONS.has(permission);
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    if (!allowed(permission)) console.warn("Denied permission request:", permission);
    callback(allowed(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => allowed(permission));
}

function registerDisplayMediaHandler() {
  // getDisplayMedia() in the renderer lands here instead of Chromium's
  // own picker: we hand back whatever source our picker chose. Audio is
  // deliberately not offered (Chromium's loopback would include Discord);
  // system audio comes from the audiocap helper instead (main/audio.ts).
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    // Only the id matters here: a 0x0 thumbnail skips rendering a
    // preview of every window just to find the one already chosen.
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 0, height: 0 },
    });
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
    title: (instanceNumber ?? 1) > 1 ? `Relay (${instanceNumber})` : "Relay",
    backgroundColor: backgroundFor(theme),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: "no-user-gesture-required",
      additionalArguments: [
        `--relay-version=${app.getVersion()}`,
        `--relay-instance=${instanceNumber}`,
        `--relay-audio=${isAudioAvailable() ? "1" : "0"}`,
        `--relay-packaged=${app.isPackaged ? "1" : "0"}`,
      ],
    },
  });
  mainWindow = window;

  // Keep the instance number visible in the title even after the page sets <title>.
  window.on("page-title-updated", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  // The X hides Relay to the tray instead of quitting, so a broadcast
  // keeps going; the tray's Quit (or quitting from anywhere) closes it.
  window.on("close", (event) => {
    if (quitting || !tray) return;
    event.preventDefault();
    window.hide();
    tray.showStillRunningHint();
  });

  // The only popup allowed is the mini player (an about:blank child the
  // renderer portals into, see packages/ui useChildWindow). External links
  // go to the browser; everything else is denied.
  window.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (frameName === FLOATING_WINDOW_NAME && url === "about:blank") {
      return { action: "allow", overrideBrowserWindowOptions: floatingWindowOptions(window) };
    }
    if (url.startsWith("https:")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("did-create-window", (child, details) => {
    if (details.frameName !== FLOATING_WINDOW_NAME) return;
    floatingWindow = child;
    child.setAspectRatio(16 / 9);
    child.setAlwaysOnTop(true, "floating");
    child.setMenu(null);
    // The mini player replaces the main window until it closes.
    window.hide();
    const stopHoverTracking = trackFloatingHover(child, window);
    child.on("closed", () => {
      if (floatingWindow === child) floatingWindow = null;
      stopHoverTracking();
      if (!window.isDestroyed()) window.show();
    });
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

const FLOATING_WINDOW_NAME = "relay-floating";
const HOVER_POLL_MS = 100;

/**
 * Tells the page whether the mouse is over the mini player, so its
 * controls show exactly while hovered. Polled from here because Windows
 * delivers no mouse events to the page over the drag grip (it's the
 * frameless window's title bar), so the page would see the mouse "leave"
 * as soon as it reached the grip. The mini player's React tree lives in
 * the main window's renderer (window.open portal), so that's who hears it.
 */
function trackFloatingHover(child: BrowserWindow, owner: BrowserWindow): () => void {
  let hovered: boolean | null = null;
  const timer = setInterval(() => {
    if (child.isDestroyed() || owner.isDestroyed()) return;
    const { x, y } = screen.getCursorScreenPoint();
    const bounds = child.getBounds();
    const inside = x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height;
    if (inside !== hovered) {
      hovered = inside;
      owner.webContents.send(IPC.floatingHover, inside);
    }
  }, HOVER_POLL_MS);
  return () => clearInterval(timer);
}
const FLOATING_SIZE = { width: 480, height: 270 };
const FLOATING_MARGIN = 24;

/** Frameless, always-on-top 16:9 window in the bottom-right of the main window's screen. */
function floatingWindowOptions(owner: BrowserWindow): Electron.BrowserWindowConstructorOptions {
  const { workArea } = screen.getDisplayMatching(owner.getBounds());
  return {
    ...FLOATING_SIZE,
    x: workArea.x + workArea.width - FLOATING_SIZE.width - FLOATING_MARGIN,
    y: workArea.y + workArea.height - FLOATING_SIZE.height - FLOATING_MARGIN,
    minWidth: 240,
    minHeight: 135,
    frame: false,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#000000",
    title: "Relay",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: "no-user-gesture-required",
    },
  };
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
 * capturePage fails on some frameless always-on-top windows
 * (UnknownVizError on the mini player); fall back to grabbing the window
 * the way a screen share would.
 */
async function captureWindow(target: BrowserWindow): Promise<Electron.NativeImage> {
  try {
    return await target.webContents.capturePage();
  } catch {
    const id = target.getMediaSourceId();
    const [width, height] = target.getContentSize();
    const sources = await desktopCapturer.getSources({ types: ["window"], thumbnailSize: { width, height } });
    const source = sources.find((candidate) => candidate.id === id);
    if (!source) throw new Error(`Couldn't capture window ${id}`);
    return source.thumbnail;
  }
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
      // A second script after the wait (e.g. read stats once viewers joined).
      if (process.env.RELAY_DEV_FINAL_SCRIPT) {
        const finalResult: unknown = await window.webContents.executeJavaScript(process.env.RELAY_DEV_FINAL_SCRIPT, true);
        console.log("Dev final script result:", typeof finalResult === "string" ? finalResult : JSON.stringify(finalResult));
      }
      // Hidden windows never paint, so capturePage would wait forever on
      // them (the main window hides while the mini player is open).
      const visible = BrowserWindow.getAllWindows().filter((candidate) => candidate.isVisible());
      for (const target of visible) {
        const image = await captureWindow(target);
        // Child windows (the mini player) get "<name>-child-N.png".
        const index = visible.filter((other) => other !== window).indexOf(target);
        const file = target === window ? pngPath : pngPath.replace(/\.png$/i, `-child-${index + 1}.png`);
        fs.writeFileSync(file, image.toPNG());
      }
    } catch (error) {
      console.error("Dev capture failed", error);
      process.exitCode = 1;
    } finally {
      // Never stop a scripted run on the "quit while broadcasting?" prompt.
      quitApproved = true;
      app.quit();
    }
  });
}

Menu.setApplicationMenu(null);

/** Brings Relay back: the mini player if it's open, else the main window. */
function showApp() {
  const target = floatingWindow && !floatingWindow.isDestroyed() ? floatingWindow : mainWindow;
  if (!target || target.isDestroyed()) return;
  if (target.isMinimized()) target.restore();
  target.show();
  target.focus();
}

/**
 * Quitting mid-broadcast ends it for everyone, so the app asks first, in
 * its own dialog (the UI's, not a native message box): main brings the
 * window up and the page answers through IPC.quitAnswer.
 */
let confirmingQuit = false;
app.on("before-quit", (event) => {
  const window = mainWindow;
  if (quitApproved || currentSession !== "broadcasting" || !window || window.isDestroyed()) {
    quitting = true;
    return;
  }
  event.preventDefault();
  showApp();
  if (confirmingQuit) return;
  confirmingQuit = true;
  window.webContents.send(IPC.quitRequest);
});

app.on("second-instance", () => showApp());

app.whenReady().then(() => {
  if (instanceNumber === null) return;
  tray = createTray({
    onOpen: showApp,
    onQuit: () => app.quit(),
    hintShown: () => storeGet(HINT_KEY) === true,
    markHintShown: () => storeSet(HINT_KEY, true),
  });
  registerIpc();
  registerPermissionHandlers();
  registerDisplayMediaHandler();
  createWindow();
  scheduleUpdateChecks();
});

app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  stopAllAudio();
  installOnQuit();
});
