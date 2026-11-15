// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Platform } from "@relay/core";
import type { RelayDesktopApi } from "../shared/api";
import { startSystemAudio } from "./systemAudio";

declare global {
  interface Window {
    relay: RelayDesktopApi;
  }
}

/** PlatformDesktop: adapts the preload bridge (window.relay) to the shared Platform port. */
export function createDesktopPlatform(api: RelayDesktopApi = window.relay): Platform {
  return {
    kind: "desktop",
    appVersion: api.appVersion,
    capabilities: { host: true, systemAudio: api.audioAvailable, floating: "window", selfUpdate: api.packaged },
    listSources: () => api.listSources(),
    async captureSource(id, options) {
      // Tell main which source our picker chose, then ask Chromium for it;
      // main's display-media handler hands that exact source back.
      await api.chooseSource(id);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: options.frameRate ?? { ideal: 30, max: 60 } },
        audio: false,
      });
      for (const track of stream.getVideoTracks()) track.contentHint = options.contentHint;
      if (options.audio && api.audioAvailable) {
        try {
          stream.addTrack(await startSystemAudio(api, id));
        } catch (error) {
          // Video alone is still a working broadcast.
          console.warn("Couldn't start system audio", error);
        }
      }
      return stream;
    },
    getSystemTheme: () => api.getTheme(),
    onSystemThemeChange: (listener) => api.onThemeChange(listener),
    getSystemLocale: () => api.getLocale(),
    storage: {
      get: async <T,>(key: string) => (await api.storeGet(key)) as T | undefined,
      set: (key, value) => api.storeSet(key, value),
    },
    // Through main: the renderer's navigator.clipboard needs document
    // focus, which a click doesn't always guarantee in Electron.
    copyText: (text) => api.copyText(text),
    updates: api.packaged
      ? {
          getStatus: () => api.updateGetStatus(),
          check: () => api.updateCheck(),
          apply: () => api.updateApply(),
          onStatus: (listener) => api.onUpdateStatus(listener),
        }
      : undefined,
    setSessionActive: (active) => api.setSessionActive(active),
  };
}
