// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

// Native side: android/app/src/main/java/com/davidambz/relay/PipPlugin.java.
// Android's WebView has no requestPictureInPicture, so the whole activity
// goes into Picture-in-Picture instead; the full-bleed player fills it.
export interface RelayPipPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  /** Shrinks the app into a PiP window now. */
  enter(): Promise<void>;
  /**
   * While true (a broadcast is playing), leaving the app (Home, recents)
   * enters PiP automatically and the screen stays on.
   */
  setWatching(options: { active: boolean }): Promise<void>;
  addListener(event: "pipChanged", listener: (state: { active: boolean }) => void): Promise<PluginListenerHandle>;
}

export const RelayPip = registerPlugin<RelayPipPlugin>("RelayPip");

// Native side: android/app/src/main/java/com/davidambz/relay/ScreenPlugin.java.
export interface RelayScreenPlugin {
  /** Hides the system bars and turns to landscape (true), or restores both. */
  setImmersive(options: { on: boolean }): Promise<void>;
}

export const RelayScreen = registerPlugin<RelayScreenPlugin>("RelayScreen");
