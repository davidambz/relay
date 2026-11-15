// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

// The port between the shared UI and whatever shell hosts it (Electron on
// Windows today, Capacitor on phones later, a plain browser for dev). The
// UI only ever talks to a Platform and decides what to show from
// `capabilities` — never by sniffing for Electron — so a new shell is "write
// one adapter", not "fork the UI".

export type Theme = "dark" | "light";

export type CaptureSourceKind = "screen" | "window";

export interface CaptureSource {
  id: string;
  kind: CaptureSourceKind;
  name: string;
  /** data: URL, 16:9-ish thumbnail of the source. */
  thumbnail: string;
  /** data: URL of the owning app's icon (windows only), if available. */
  icon?: string;
}

/** "detail" favors sharp text/code, "motion" favors smooth frame rate. */
export type ContentHint = "detail" | "motion";

export interface CaptureOptions {
  contentHint: ContentHint;
  /** Add system audio (minus Discord, see audiocap) when the platform can. */
  audio?: boolean;
  frameRate?: { ideal: number; max: number };
}

export interface PlatformCapabilities {
  /** Can start a broadcast (desktop only in v1). */
  host: boolean;
  /** Can send system audio minus Discord (phase 2, desktop audiocap helper). */
  systemAudio: boolean;
  /** How the viewer's mini player is provided. */
  floating: "window" | "pip" | "none";
  /** Can download and install its own updates (desktop Inno Setup builds). */
  selfUpdate: boolean;
}

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface Platform {
  kind: "desktop" | "mobile" | "web";
  capabilities: PlatformCapabilities;
  appVersion: string;

  listSources?(): Promise<CaptureSource[]>;
  captureSource?(id: string, options: CaptureOptions): Promise<MediaStream>;

  getSystemTheme(): Promise<Theme>;
  /** Returns an unsubscribe function. */
  onSystemThemeChange(listener: (theme: Theme) => void): () => void;
  /** BCP 47 tag of the OS UI language, e.g. "pt-BR". */
  getSystemLocale(): Promise<string>;

  storage: KeyValueStore;

  /** Copies text to the system clipboard. Rejects if it couldn't. */
  copyText(text: string): Promise<void>;
}
