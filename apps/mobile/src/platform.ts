// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { App } from "@capacitor/app";
import type { KeyValueStore, Platform, Theme } from "@relay/core";
import { RelayPip, RelayScreen } from "./pip";

function prefersDark(): MediaQueryList {
  return window.matchMedia("(prefers-color-scheme: dark)");
}

// The WebView's localStorage persists with the app's data (cleared only
// when the user clears app storage), which is all settings need here.
const storage: KeyValueStore = {
  async get<T>(key: string) {
    const raw = localStorage.getItem(`relay:${key}`);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  },
  async set<T>(key: string, value: T) {
    localStorage.setItem(`relay:${key}`, JSON.stringify(value));
  },
};

/**
 * PlatformMobile: viewer-only. Broadcasting from a phone needs native
 * screen capture (MediaProjection) and isn't part of this app yet; updates
 * come as new APKs from GitHub Releases, not self-installed.
 */
export function createMobilePlatform(appVersion: string): Platform {
  return {
    kind: "mobile",
    appVersion,
    capabilities: { host: false, systemAudio: false, floating: "pip", selfUpdate: false },
    async getSystemTheme(): Promise<Theme> {
      return prefersDark().matches ? "dark" : "light";
    },
    onSystemThemeChange(listener) {
      const media = prefersDark();
      const handler = (event: MediaQueryListEvent) => listener(event.matches ? "dark" : "light");
      media.addEventListener("change", handler);
      return () => media.removeEventListener("change", handler);
    },
    async getSystemLocale() {
      return navigator.language;
    },
    storage,
    copyText: (text) => navigator.clipboard.writeText(text),
    async enterPictureInPicture() {
      await RelayPip.enter();
    },
    setSessionActive(active) {
      // While watching: Home turns the app into a PiP window, screen stays on.
      void RelayPip.setWatching({ active }).catch(() => {});
    },
    async setImmersive(on) {
      await RelayScreen.setImmersive({ on });
    },
    onPictureInPictureChange(listener) {
      const handle = RelayPip.addListener("pipChanged", (state) => listener(state.active));
      return () => void handle.then((registered) => registered.remove());
    },
    onBackButton(handler) {
      const listener = App.addListener("backButton", () => {
        if (!handler()) void App.minimizeApp();
      });
      return () => void listener.then((handle) => handle.remove());
    },
  };
}
