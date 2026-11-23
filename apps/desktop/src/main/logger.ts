// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, shell } from "electron";
import { formatLogLine, type LogEntry } from "@relay/core";

// The diagnostics log: <userData>/logs/relay.log, rolled over to
// relay.1.log at 2 MB, so it never takes more than about 4 MB. Lines are
// redacted by formatLogLine (no codes, addresses or credentials). Nothing
// is sent anywhere; Settings opens the folder for someone to pass it on.

const MAX_BYTES = 2 * 1024 * 1024;
// A runaway loop in the page must not fill the disk or the log.
const BURST_LINES = 200;
const BURST_WINDOW_MS = 10_000;

let size: number | null = null;
let burstStart = 0;
let burstLines = 0;
let dropped = 0;

export function logDir(): string {
  return path.join(app.getPath("userData"), "logs");
}

function logFile(): string {
  return path.join(logDir(), "relay.log");
}

function rotate() {
  const file = logFile();
  try {
    fs.renameSync(file, path.join(logDir(), "relay.1.log"));
  } catch {
    // Nothing to roll over yet.
  }
  size = 0;
}

function append(line: string) {
  try {
    if (size === null) {
      fs.mkdirSync(logDir(), { recursive: true });
      size = fs.existsSync(logFile()) ? fs.statSync(logFile()).size : 0;
    }
    if (size + line.length > MAX_BYTES) rotate();
    fs.appendFileSync(logFile(), line);
    size += Buffer.byteLength(line);
  } catch (error) {
    // A log that can't be written must never take the app down.
    console.warn("Couldn't write the log", error);
  }
}

export function writeLog(entry: LogEntry) {
  const now = Date.now();
  if (now - burstStart > BURST_WINDOW_MS) {
    if (dropped > 0) append(`${formatLogLine(new Date(), { level: "warn", scope: "log", message: `Skipped ${dropped} lines` })}\n`);
    burstStart = now;
    burstLines = 0;
    dropped = 0;
  }
  if (++burstLines > BURST_LINES) {
    dropped++;
    return;
  }
  append(`${formatLogLine(new Date(now), entry)}\n`);
  if (!app.isPackaged && entry.level !== "info") console.log(`[log] ${entry.scope}: ${entry.message}`);
}

export const log = {
  info: (scope: string, message: string, data?: LogEntry["data"]) => writeLog({ level: "info", scope, message, data }),
  warn: (scope: string, message: string, data?: LogEntry["data"]) => writeLog({ level: "warn", scope, message, data }),
  error: (scope: string, message: string, data?: LogEntry["data"]) => writeLog({ level: "error", scope, message, data }),
};

/** First line of every run: what's running where. */
export function logStartup(instance: number | null) {
  log.info("app", `Relay ${app.getVersion()} started`, {
    windows: os.release(),
    arch: process.arch,
    electron: process.versions.electron,
    packaged: app.isPackaged,
    instance,
    locale: app.getLocale(),
  });
  process.on("uncaughtException", (error) => log.error("app", `Uncaught: ${error.stack ?? error.message}`));
  process.on("unhandledRejection", (reason) => log.error("app", `Unhandled rejection: ${String(reason)}`));
}

export async function openLogFolder(): Promise<void> {
  fs.mkdirSync(logDir(), { recursive: true });
  const error = await shell.openPath(logDir());
  if (error) throw new Error(error);
}
