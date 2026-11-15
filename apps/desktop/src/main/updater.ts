// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { app, BrowserWindow, net } from "electron";
import { evaluateRelease, type UpdateCheck } from "@relay/core";
import type { UpdateStatus } from "@relay/core";
import { IPC } from "../shared/api";

// Self-update, same mechanism as Umbra's updater.cpp: GitHub's latest
// release is checked on start, every 24 h and on demand; applying an
// update downloads RelaySetup-X.Y.Z.exe and runs it silently. The
// installer's [Run] entry relaunches Relay when given /RELAUNCH, since
// Electron doesn't register with Restart Manager the way Umbra does.

// RELAY_UPDATE_REPO points a dev build at another repo to test updates;
// an installed copy always updates from the real one.
const REPO = (!app.isPackaged && process.env.RELAY_UPDATE_REPO) || "davidambz/relay";
const INSTALLER_FILE_PREFIX = "RelaySetup-update-";
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
      check = evaluateRelease(app.getVersion(), await response.json(), REPO);
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
  const { downloadUrl, latestVersion, sha256 } = lastCheck;
  setStatus({ state: "downloading", latestVersion });
  // Unique name: a background check and a manual apply must never write
  // the same file, or one could launch a half-written installer.
  const installer = path.join(os.tmpdir(), `${INSTALLER_FILE_PREFIX}${process.pid}-${Date.now()}.exe`);
  try {
    await download(downloadUrl, installer, sha256);
    setStatus({ state: "installing", latestVersion });
    spawn(installer, ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/RELAUNCH"], {
      detached: true,
      stdio: "ignore",
    }).unref();
    // Get out of the installer's way; it relaunches us when done.
    setTimeout(() => app.quit(), 500);
  } catch (error) {
    fs.rm(installer, { force: true }, () => {});
    setStatus({ state: "failed", reason: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Streams the installer to disk (it's ~100 MB; buffering it would also
 * block the main process on one big synchronous write), hashing it on the
 * way. With a known SHA-256, a mismatch fails the update.
 */
async function download(url: string, file: string, sha256: string | undefined): Promise<void> {
  const response = await net.fetch(url, { headers: { "User-Agent": "Relay-Updater" } });
  if (!response.ok || !response.body) throw new Error(`Download failed with ${response.status}`);
  const hash = createHash("sha256");
  const hashing = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body as WebReadableStream), hashing, fs.createWriteStream(file));
  const actual = hash.digest("hex");
  if (sha256 && actual !== sha256) throw new Error("The downloaded installer doesn't match its published checksum");
}

/**
 * Installers from earlier updates stay in the temp folder (one can't
 * delete itself). Clear them out; one still running fails to delete and
 * is simply left for next time.
 */
function removeOldInstallers() {
  const dir = os.tmpdir();
  fs.readdir(dir, (error, names) => {
    if (error) return;
    for (const name of names) {
      if (name.startsWith(INSTALLER_FILE_PREFIX) && name.toLowerCase().endsWith(".exe")) {
        fs.rm(path.join(dir, name), { force: true }, () => {});
      }
    }
  });
}

/**
 * Packaged builds only. At startup an available update is applied right
 * away if nothing is running (a quick restart right after opening is the
 * least disruptive moment); the daily check only announces it, so the
 * app never restarts out of the blue later on.
 */
export function scheduleUpdateChecks() {
  if (!app.isPackaged) return;
  removeOldInstallers();
  setTimeout(() => {
    void checkForUpdate().then((check) => {
      if (check.status === "available" && !sessionActive) void applyUpdate().catch(() => {});
    });
  }, STARTUP_DELAY_MS);
  setInterval(() => void checkForUpdate(), DAY_MS);
}
