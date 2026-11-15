// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.davidambz.relay",
  appName: "Relay",
  webDir: "dist",
  android: {
    // Matches --color-bg (dark) so the WebView never flashes white on start.
    backgroundColor: "#111416",
  },
};

export default config;
