// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFile } from "node:child_process";
import { resolveNativeTool } from "./nativeTools";

export interface OpenWindow {
  hwnd: number;
  pid: number;
  exe: string;
  title: string;
}

const TIMEOUT_MS = 3000;
let warnedMissing = false;

/**
 * The windows Alt+Tab would show, from native/winlist. desktopCapturer
 * alone also returns overlays (NVIDIA, Discord, Overwolf), launchers
 * parked off-screen (Raycast) and invisible helper windows, and Electron
 * doesn't expose the window styles needed to tell them apart.
 *
 * Resolves null when the helper is missing or fails, so the caller can
 * fall back to the unfiltered list instead of showing no windows at all.
 */
export function listOpenWindows(): Promise<OpenWindow[] | null> {
  const exe = resolveNativeTool("winlist");
  if (!exe) {
    if (!warnedMissing) {
      console.warn("winlist.exe not found; the Windows tab will show every capturable window");
      warnedMissing = true;
    }
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    execFile(exe, [], { timeout: TIMEOUT_MS, windowsHide: true, encoding: "utf8" }, (error, stdout) => {
      if (error) {
        console.warn("winlist failed", error.message);
        resolve(null);
        return;
      }
      try {
        const parsed: unknown = JSON.parse(stdout);
        resolve(Array.isArray(parsed) ? (parsed as OpenWindow[]) : null);
      } catch {
        console.warn("winlist printed something that isn't JSON");
        resolve(null);
      }
    });
  });
}

/** Chromium window source ids look like "window:<hwnd>:0". */
export function hwndFromSourceId(id: string): number | null {
  const match = /^window:(\d+):/.exec(id);
  return match ? Number(match[1]) : null;
}
