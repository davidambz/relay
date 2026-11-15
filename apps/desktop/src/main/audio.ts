// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { MessageChannelMain, type MessagePortMain, type WebContents } from "electron";
import { resolveNativeTool } from "./nativeTools";
import { hwndFromSourceId, listOpenWindows } from "./windowList";

// System audio for a broadcast, from native/audiocap (WASAPI process
// loopback). Chromium's own loopback captures the whole system, Discord's
// voice chat included; audiocap can capture one app, or everything but one.

export type AudioMode = { kind: "include"; pid: number } | { kind: "exclude"; pid: number } | { kind: "system" };

const BYTES_PER_FRAME = 8; // float32 x 2 channels

export function isAudioAvailable(): boolean {
  return resolveNativeTool("audiocap") !== null;
}

function findDiscordRoot(exe: string): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(exe, ["--find-discord"], { timeout: 3000, windowsHide: true }, (error, stdout) => {
      const pid = Number.parseInt(String(stdout).trim(), 10);
      resolve(error || !Number.isFinite(pid) ? null : pid);
    });
  });
}

/**
 * Which sound goes with a source:
 * - a window: only its app (the window owner's process tree). Discord is
 *   naturally left out unless you're sharing Discord itself.
 * - a monitor (or a window we can't attribute, e.g. UWP frames owned by
 *   ApplicationFrameHost): everything except Discord's process tree, or
 *   the whole system when Discord isn't running.
 */
export async function resolveAudioMode(exe: string, sourceId: string): Promise<AudioMode> {
  const hwnd = hwndFromSourceId(sourceId);
  if (hwnd !== null) {
    const windows = await listOpenWindows();
    const owner = windows?.find((window) => window.hwnd === hwnd);
    if (owner && owner.pid > 0 && owner.exe.toLowerCase() !== "applicationframehost.exe") {
      return { kind: "include", pid: owner.pid };
    }
  }
  const discord = await findDiscordRoot(exe);
  return discord !== null ? { kind: "exclude", pid: discord } : { kind: "system" };
}

function argsFor(mode: AudioMode): string[] {
  if (mode.kind === "include") return ["--include", String(mode.pid)];
  if (mode.kind === "exclude") return ["--exclude", String(mode.pid)];
  return ["--system"];
}

interface Capture {
  /** Identifies this capture, so stopping an old one can't stop its successor. */
  id: number;
  child: ChildProcessWithoutNullStreams;
  port: MessagePortMain;
}

const captures = new Map<number, Capture>();
let nextCaptureId = 1;

/**
 * Starts audiocap for a renderer and hands it a MessagePort that receives
 * ArrayBuffers of interleaved float32 48 kHz stereo PCM. Replaces any
 * capture that renderer already had (switching sources mid-broadcast).
 * Resolves with the capture's id, for stopAudio.
 */
export async function startAudio(contents: WebContents, sourceId: string): Promise<{ id: number; mode: AudioMode }> {
  const exe = resolveNativeTool("audiocap");
  if (!exe) throw new Error("audiocap.exe not found");
  stopAudio(contents.id);
  const mode = await resolveAudioMode(exe, sourceId);

  const child = spawn(exe, argsFor(mode), { windowsHide: true });
  const { port1, port2 } = new MessageChannelMain();
  const id = nextCaptureId++;
  captures.set(contents.id, { id, child, port: port1 });
  contents.postMessage("audio:port", null, [port2]);
  port1.start();

  // stdout chunks don't respect frame boundaries; carry the remainder.
  let remainder = Buffer.alloc(0);
  child.stdout.on("data", (chunk: Buffer) => {
    const data = remainder.length ? Buffer.concat([remainder, chunk]) : chunk;
    const usable = data.length - (data.length % BYTES_PER_FRAME);
    remainder = Buffer.from(data.subarray(usable));
    if (usable === 0) return;
    // Copy into a fresh, aligned ArrayBuffer (Node's pooled Buffers share theirs).
    const frames = new Uint8Array(usable);
    frames.set(data.subarray(0, usable));
    port1.postMessage(frames.buffer);
  });
  child.stderr.on("data", (line: Buffer) => console.log("[audiocap]", String(line).trim()));
  child.on("exit", (code) => {
    if (captures.get(contents.id)?.child === child) captures.delete(contents.id);
    port1.close();
    if (code) console.warn("audiocap exited with code", code);
  });
  contents.once("destroyed", () => stopAudio(contents.id));
  return { id, mode };
}

/** Stops a renderer's capture; with `captureId`, only if it's still that one. */
export function stopAudio(contentsId: number, captureId?: number) {
  const capture = captures.get(contentsId);
  if (!capture || (captureId !== undefined && capture.id !== captureId)) return;
  captures.delete(contentsId);
  capture.port.close();
  // Closing stdin is audiocap's clean stop signal; kill if it lingers.
  capture.child.stdin.end();
  const timer = setTimeout(() => capture.child.kill(), 1000);
  capture.child.once("exit", () => clearTimeout(timer));
}

export function stopAllAudio() {
  for (const id of [...captures.keys()]) stopAudio(id);
}
