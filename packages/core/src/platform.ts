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

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "up-to-date" }
  | { state: "available"; latestVersion: string }
  | { state: "downloading"; latestVersion: string }
  | { state: "installing"; latestVersion: string }
  | { state: "failed"; reason: string };

export interface UpdatesApi {
  getStatus(): Promise<UpdateStatus>;
  check(): Promise<void>;
  /** Downloads and installs; the app restarts. Rejects during a session. */
  apply(): Promise<void>;
  onStatus(listener: (status: UpdateStatus) => void): () => void;
}

/** A broadcast or a viewer session in progress. */
export type SessionKind = "broadcasting" | "watching";

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

  /** Self-update, where capabilities.selfUpdate is true. */
  updates?: UpdatesApi;
  /**
   * Tells the shell what's running, if anything: it holds back update
   * restarts during a session, and shells react in their own way (the
   * desktop tray lights up and asks before quitting a broadcast; Android
   * keeps the screen on and auto-enters PiP while watching).
   */
  setSession?(session: SessionKind | null): void;
  /**
   * Desktop: the app is about to quit mid-broadcast (from the tray, say).
   * The handler asks the person and resolves true to quit and end the
   * broadcast, false to keep going. Returns an unsubscribe function.
   */
  onQuitRequest?(handler: () => Promise<boolean>): () => void;

  /**
   * Native Picture-in-Picture for shells where the web API isn't available
   * (Android's WebView): the whole app becomes the PiP window.
   */
  enterPictureInPicture?(): Promise<void>;
  /**
   * Hardware/gesture back (Android). The handler returns true if it
   * navigated within the app; otherwise the shell backgrounds the app.
   */
  onBackButton?(handler: () => boolean): () => void;
  /**
   * Phones: while the player is fullscreen, hide the system bars and turn
   * the screen to landscape; false restores both.
   */
  setImmersive?(on: boolean): Promise<void>;
  /**
   * Shells whose Picture-in-Picture shrinks the whole app (Android): tells
   * the UI when PiP starts and ends, so it can show only the video.
   * Returns an unsubscribe function.
   */
  onPictureInPictureChange?(listener: (active: boolean) => void): () => void;
  /**
   * Desktop mini player: whether the mouse is over its window, tracked by
   * the shell. Windows doesn't send the page mouse events over the
   * window's drag area, so the page alone can't tell. Returns an
   * unsubscribe function.
   */
  onFloatingHover?(listener: (hovered: boolean) => void): () => void;
}
