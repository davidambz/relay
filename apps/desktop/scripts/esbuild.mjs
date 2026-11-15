// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

// Bundles the Electron main and preload scripts to CommonJS. Everything is
// inlined except electron itself, so the packaged app needs no
// node_modules at runtime.
import { build } from "esbuild";

export function buildElectron({ production = false } = {}) {
  const common = {
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    external: ["electron"],
    sourcemap: !production,
    minify: production,
    logLevel: "warning",
  };
  return Promise.all([
    build({ ...common, entryPoints: ["src/main/main.ts"], outfile: "dist-electron/main.cjs" }),
    build({ ...common, entryPoints: ["src/preload.ts"], outfile: "dist-electron/preload.cjs" }),
  ]);
}
