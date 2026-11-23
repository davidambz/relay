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
import { log } from "./logger";

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

/**
 * A broadcast or a viewer session is running: never restart under it, and
 * never download under it either (the installer is ~100 MB, competing
 * with the stream for the connection). A download in progress is called
 * off, and the update is fetched once nothing is running.
 */
export function setSessionActive(active: boolean) {
  if (active === sessionActive) return;
  sessionActive = active;
  if (active) {
    if (prepared && !prepared.ready) {
      log.info("updates", "Download paused for a session");
      prepared.abort.abort();
    }
  } else {
    downloadInBackground();
  }
}

/** Fetches the available update's installer, unless a session is running. */
function downloadInBackground() {
  const check = lastCheck;
  if (check?.status !== "available" || !app.isPackaged || sessionActive) return;
  void prepareInstaller(check).then(
    () => log.info("updates", "Installer downloaded", { version: check.latestVersion }),
    (error) => {
      if (error instanceof Error && error.name === "AbortError") return;
      log.warn("updates", "Download failed", { reason: error instanceof Error ? error.message : String(error) });
      console.warn("Couldn't download the update", error);
    },
  );
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
  if (check.status === "failed") log.warn("updates", "Check failed", { reason: check.reason });
  else log.info("updates", "Checked", { status: check.status, latest: check.latestVersion });
  // Fetch the installer in the background (not during a session), so
  // applying or quitting later doesn't have to wait for it.
  downloadInBackground();
  setStatus(
    check.status === "available"
      ? { state: "available", latestVersion: check.latestVersion }
      : check.status === "failed"
        ? { state: "failed", reason: check.reason }
        : { state: "up-to-date" },
  );
  return check;
}

/**
 * The verified installer for one version, downloaded at most once. Kept
 * on disk so quitting can hand off to it instantly (see installOnQuit).
 */
let prepared: { version: string; file: Promise<string>; ready: string | null; abort: AbortController } | null = null;
let installerLaunched = false;

function prepareInstaller(check: Extract<UpdateCheck, { status: "available" }>): Promise<string> {
  if (prepared?.version === check.latestVersion) return prepared.file;
  // Unique name: never reuse a file another run may still be writing.
  const installer = path.join(os.tmpdir(), `${INSTALLER_FILE_PREFIX}${process.pid}-${Date.now()}.exe`);
  const abort = new AbortController();
  const entry: NonNullable<typeof prepared> = {
    version: check.latestVersion,
    ready: null,
    abort,
    file: download(check.downloadUrl, installer, check.sha256, abort.signal).then(
      () => {
        entry.ready = installer;
        return installer;
      },
      (error: unknown) => {
        fs.rm(installer, { force: true }, () => {});
        // Let a later attempt try again from scratch.
        if (prepared === entry) prepared = null;
        throw error;
      },
    ),
  };
  prepared = entry;
  return entry.file;
}

function launchInstaller(file: string, relaunch: boolean) {
  installerLaunched = true;
  log.info("updates", "Installing", { version: prepared?.version, relaunch });
  const args = ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"];
  if (relaunch) args.push("/RELAUNCH");
  spawn(file, args, { detached: true, stdio: "ignore" }).unref();
}

export async function applyUpdate(): Promise<void> {
  if (lastCheck?.status !== "available") throw new Error("No update to apply");
  if (sessionActive) throw new Error("Not while broadcasting or watching");
  const check = lastCheck;
  const { latestVersion } = check;
  setStatus({ state: "downloading", latestVersion });
  try {
    const installer = await prepareInstaller(check);
    if (installerLaunched) return;
    setStatus({ state: "installing", latestVersion });
    launchInstaller(installer, true);
    // Get out of the installer's way; it relaunches us when done.
    setTimeout(() => app.quit(), 500);
  } catch (error) {
    setStatus({ state: "failed", reason: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * An update found while broadcasting or watching can't restart the app,
 * so it waits. When the app quits with that update's installer already
 * downloaded and verified, install it silently on the way out, without
 * relaunching (the user asked to quit). Never waits on a download: if
 * the installer isn't ready, the next start's check handles it.
 */
export function installOnQuit() {
  if (!app.isPackaged || installerLaunched || !prepared?.ready) return;
  if (lastCheck?.status !== "available" || lastCheck.latestVersion !== prepared.version) return;
  launchInstaller(prepared.ready, false);
}

/**
 * Streams the installer to disk (it's ~100 MB; buffering it would also
 * block the main process on one big synchronous write), hashing it on the
 * way. With a known SHA-256, a mismatch fails the update.
 */
async function download(url: string, file: string, sha256: string | undefined, signal: AbortSignal): Promise<void> {
  const response = await net.fetch(url, { headers: { "User-Agent": "Relay-Updater" }, signal });
  if (!response.ok || !response.body) throw new Error(`Download failed with ${response.status}`);
  const hash = createHash("sha256");
  const hashing = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body as WebReadableStream), hashing, fs.createWriteStream(file), { signal });
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
 * least disruptive moment); the daily check only announces and downloads
 * it, to be installed from the Updates panel or on quit, so the
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
