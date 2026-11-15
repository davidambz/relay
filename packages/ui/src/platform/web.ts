// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { KeyValueStore, Platform, Theme } from "@relay/core";

// Plain-browser adapter: viewer only (no custom source picker outside
// Electron). Used by `npm run dev:web` to iterate on the UI and check it
// at phone widths, which also proves the UI has no Electron dependency.

function prefersDark(): MediaQueryList | undefined {
  return window.matchMedia?.("(prefers-color-scheme: dark)");
}

function localStorageStore(prefix: string): KeyValueStore {
  return {
    async get<T>(key: string) {
      try {
        const raw = localStorage.getItem(prefix + key);
        return raw === null ? undefined : (JSON.parse(raw) as T);
      } catch {
        return undefined;
      }
    },
    async set<T>(key: string, value: T) {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      } catch {
        // Storage can be unavailable (private mode); settings just won't persist.
      }
    },
  };
}

export function createWebPlatform(): Platform {
  return {
    kind: "web",
    appVersion: "0.0.0-web",
    capabilities: { host: false, systemAudio: false, floating: "pip", selfUpdate: false },
    async getSystemTheme(): Promise<Theme> {
      return prefersDark()?.matches ? "dark" : "light";
    },
    onSystemThemeChange(listener) {
      const media = prefersDark();
      if (!media) return () => {};
      const handler = (event: MediaQueryListEvent) => listener(event.matches ? "dark" : "light");
      media.addEventListener("change", handler);
      return () => media.removeEventListener("change", handler);
    },
    async getSystemLocale() {
      return navigator.language ?? "en";
    },
    storage: localStorageStore("relay:"),
    copyText: (text) => navigator.clipboard.writeText(text),
  };
}
