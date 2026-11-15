// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Platform } from "@relay/core";

export function fakePlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    kind: "desktop",
    appVersion: "0.0.0-test",
    capabilities: { host: true, systemAudio: false, floating: "window", selfUpdate: false },
    getSystemTheme: async () => "dark",
    onSystemThemeChange: () => () => {},
    getSystemLocale: async () => "en",
    storage: { get: async () => undefined, set: async () => {} },
    ...overrides,
  };
}
