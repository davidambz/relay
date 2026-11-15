// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { build as viteBuild } from "vite";
import { buildElectron } from "./esbuild.mjs";

await viteBuild({ configFile: "vite.config.ts", logLevel: "warn" });
await buildElectron({ production: true });
console.log("Built dist-renderer/ and dist-electron/");
