// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

// The contract between preload (which exposes it as window.relay) and the
// renderer's PlatformDesktop adapter. Kept tiny and serializable: the
// renderer never sees Electron or Node objects.

import type { CaptureSource, Theme } from "@relay/core";

export interface InstanceInfo {
  /** 1 for the first copy running, 2+ for extra copies (separate profile). */
  number: number;
}

export interface RelayDesktopApi {
  appVersion: string;
  instance: InstanceInfo;
  listSources(): Promise<CaptureSource[]>;
  chooseSource(id: string): Promise<void>;
  getTheme(): Promise<Theme>;
  onThemeChange(listener: (theme: Theme) => void): () => void;
  getLocale(): Promise<string>;
  storeGet(key: string): Promise<unknown>;
  storeSet(key: string, value: unknown): Promise<void>;
}

export const IPC = {
  listSources: "sources:list",
  chooseSource: "sources:choose",
  getTheme: "theme:get",
  themeChanged: "theme:changed",
  getLocale: "locale:get",
  storeGet: "store:get",
  storeSet: "store:set",
} as const;
