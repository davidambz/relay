// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow, net } from "electron";
import { evaluateRelease, type UpdateCheck } from "@relay/core";
import type { UpdateStatus } from "@relay/core";
import { IPC } from "../shared/api";

// Self-update, same mechanism as Umbra's updater.cpp: GitHub's latest
// release is checked on start, every 24 h and on demand; applying an
// update downloads RelaySetup-X.Y.Z.exe and runs it silently. The
// installer's [Run] entry relaunches Relay when given /RELAUNCH, since
// Electron doesn't register with Restart Manager the way Umbra does.

const REPO = process.env.RELAY_UPDATE_REPO ?? "davidambz/relay";
const DAY_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 8000;

let status: UpdateStatus = { state: "idle" };
let lastCheck: UpdateCheck | null = null;
let sessionActive = false;

function setStatus(next: UpdateStatus) {
  status = next;
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(IPC.updateStatus, status);
}

export function getUpdateStatus(): UpdateStatus {
  return status;
}

/** A broadcast or a viewer session is running: never restart under it. */
export function setSessionActive(active: boolean) {
  sessionActive = active;
}

export async function checkForUpdate(): Promise<UpdateCheck> {
  setStatus({ state: "checking" });
  let check: UpdateCheck;
  try {
    const response = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Relay-Updater" },
    });
    if (response.status === 404) {
      check = { status: "up-to-date" }; // no releases published yet
    } else if (!response.ok) {
      check = { status: "failed", reason: `GitHub answered ${response.status}` };
    } else {
      check = evaluateRelease(app.getVersion(), await response.json());
    }
  } catch (error) {
    check = { status: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
  lastCheck = check;
  setStatus(
    check.status === "available"
      ? { state: "available", latestVersion: check.latestVersion }
      : check.status === "failed"
        ? { state: "failed", reason: check.reason }
        : { state: "up-to-date" },
  );
  return check;
}

export async function applyUpdate(): Promise<void> {
  if (lastCheck?.status !== "available") throw new Error("No update to apply");
  if (sessionActive) throw new Error("Not while broadcasting or watching");
  const { downloadUrl, latestVersion } = lastCheck;
  setStatus({ state: "downloading", latestVersion });
  try {
    const response = await net.fetch(downloadUrl, { headers: { "User-Agent": "Relay-Updater" } });
    if (!response.ok) throw new Error(`Download failed with ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    // Unique name: a background check and a manual apply must never write
    // the same file, or one could launch a half-written installer.
    const installer = path.join(os.tmpdir(), `RelaySetup-update-${process.pid}-${Date.now()}.exe`);
    fs.writeFileSync(installer, bytes);
    setStatus({ state: "installing", latestVersion });
    spawn(installer, ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/RELAUNCH"], {
      detached: true,
      stdio: "ignore",
    }).unref();
    // Get out of the installer's way; it relaunches us when done.
    setTimeout(() => app.quit(), 500);
  } catch (error) {
    setStatus({ state: "failed", reason: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Packaged builds only. At startup an available update is applied right
 * away if nothing is running (a quick restart right after opening is the
 * least disruptive moment); the daily check only announces it, so the
 * app never restarts out of the blue later on.
 */
export function scheduleUpdateChecks() {
  if (!app.isPackaged) return;
  setTimeout(() => {
    void checkForUpdate().then((check) => {
      if (check.status === "available" && !sessionActive) void applyUpdate().catch(() => {});
    });
  }, STARTUP_DELAY_MS);
  setInterval(() => void checkForUpdate(), DAY_MS);
}
