// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

// The contract between preload (which exposes it as window.relay) and the
// renderer's PlatformDesktop adapter. Kept tiny and serializable: the
// renderer never sees Electron or Node objects.

import type { CaptureSource, SessionKind, Theme, UpdateStatus } from "@relay/core";

export interface InstanceInfo {
  /** 1 for the first copy running, 2+ for extra copies (separate profile). */
  number: number;
}

export interface RelayDesktopApi {
  appVersion: string;
  instance: InstanceInfo;
  /** native/audiocap is present, so broadcasts can carry system audio. */
  audioAvailable: boolean;
  /**
   * Starts audiocap for a source (replacing this window's previous one);
   * a MessagePort with PCM follows via window.postMessage. Resolves with
   * the capture's id.
   */
  audioStart(sourceId: string): Promise<number>;
  /** Stops that capture, if it's still the current one. */
  audioStop(captureId: number): Promise<void>;
  /** Packaged build (installed through Inno Setup): self-update is possible. */
  packaged: boolean;
  updateGetStatus(): Promise<UpdateStatus>;
  updateCheck(): Promise<void>;
  updateApply(): Promise<void>;
  onUpdateStatus(listener: (status: UpdateStatus) => void): () => void;
  setSession(session: SessionKind | null): void;
  /** Main asks whether to quit mid-broadcast; answer with answerQuit. */
  onQuitRequest(listener: () => void): () => void;
  answerQuit(confirmed: boolean): void;
  listSources(): Promise<CaptureSource[]>;
  chooseSource(id: string): Promise<void>;
  getTheme(): Promise<Theme>;
  onThemeChange(listener: (theme: Theme) => void): () => void;
  getLocale(): Promise<string>;
  storeGet(key: string): Promise<unknown>;
  storeSet(key: string, value: unknown): Promise<void>;
  copyText(text: string): Promise<void>;
  /** Mouse entering/leaving the mini player window (polled by main). */
  onFloatingHover(listener: (hovered: boolean) => void): () => void;
}

export const IPC = {
  listSources: "sources:list",
  chooseSource: "sources:choose",
  getTheme: "theme:get",
  themeChanged: "theme:changed",
  getLocale: "locale:get",
  storeGet: "store:get",
  storeSet: "store:set",
  copyText: "clipboard:write",
  audioStart: "audio:start",
  audioStop: "audio:stop",
  audioPort: "audio:port",
  updateGetStatus: "update:get-status",
  updateCheck: "update:check",
  updateApply: "update:apply",
  updateStatus: "update:status",
  session: "session:changed",
  quitRequest: "quit:request",
  quitAnswer: "quit:answer",
  floatingHover: "floating:hover",
} as const;
