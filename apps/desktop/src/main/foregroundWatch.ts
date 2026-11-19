// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolveNativeTool } from "./nativeTools";

export interface ForegroundState {
  /** The foreground window covers its whole monitor (a game, a video). */
  fullscreen: boolean;
  /** That monitor, in physical pixels (left, top, right, bottom). */
  monitor: [number, number, number, number];
}

function isForegroundState(value: unknown): value is ForegroundState {
  if (typeof value !== "object" || value === null) return false;
  const { fullscreen, monitor } = value as Record<string, unknown>;
  return typeof fullscreen === "boolean" && Array.isArray(monitor) && monitor.length === 4 && monitor.every(Number.isFinite);
}

/**
 * Follows the foreground window with native/winlist --watch-foreground:
 * `onChange` hears every switch of foreground window or of its monitor or
 * fullscreen state. Relay's own windows never count as fullscreen. If the
 * helper exits early, `onLost` fires, so nothing stays stuck on its last
 * report. Returns a stop function; null when the helper is missing.
 */
export function watchForeground(
  onChange: (state: ForegroundState) => void,
  onLost: () => void,
): (() => void) | null {
  const exe = resolveNativeTool("winlist");
  if (!exe) {
    console.warn("winlist.exe not found; the mini player won't step aside for fullscreen games");
    return null;
  }
  const child = spawn(exe, ["--watch-foreground", "--ignore-pid", String(process.pid)], {
    stdio: ["pipe", "pipe", "ignore"],
    windowsHide: true,
  });
  let stopping = false;
  child.on("error", (error) => console.warn("winlist --watch-foreground failed", error.message));
  child.on("exit", (code) => {
    if (stopping) return;
    console.warn(`winlist --watch-foreground exited (${code})`);
    onLost();
  });
  // Writing to (or ending) a pipe whose process is gone errors; nothing to do then.
  child.stdin.on("error", () => {});
  createInterface({ input: child.stdout }).on("line", (line) => {
    try {
      const parsed: unknown = JSON.parse(line);
      if (isForegroundState(parsed)) onChange(parsed);
    } catch {
      console.warn("winlist --watch-foreground printed something that isn't JSON");
    }
  });
  // Closing its stdin is how the helper is told to exit.
  return () => {
    stopping = true;
    if (child.exitCode !== null || child.killed) return;
    child.stdin.end();
    setTimeout(() => {
      if (child.exitCode === null) child.kill();
    }, 1000);
  };
}
