// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

// Dev runner: one Vite server for the renderer, the main/preload bundles,
// and N Electron windows pointed at it.
//
//   npm run dev                  one instance
//   npm run dev -- --instances 2 two instances (broadcast in one, watch in the other)
//
// Each extra instance gets its own profile automatically (see
// src/main/instance.ts), so they don't fight over Chromium's cache.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "vite";
import { buildElectron } from "./esbuild.mjs";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const args = process.argv.slice(2);
const flagIndex = args.indexOf("--instances");
const instances = flagIndex >= 0 ? Math.max(1, Number(args[flagIndex + 1]) || 1) : 1;

await buildElectron();
const server = await createServer({ configFile: "vite.config.ts" });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("Vite didn't report a local URL");
console.log(`Renderer at ${url}, launching ${instances} instance(s)`);

let running = 0;
for (let i = 0; i < instances; i++) {
  running++;
  const child = spawn(electronPath, ["."], {
    stdio: "inherit",
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
  });
  child.on("exit", async () => {
    if (--running === 0) {
      await server.close();
      process.exit(0);
    }
  });
  // Stagger launches so each claims its profile slot before the next starts.
  await new Promise((resolve) => setTimeout(resolve, 1500));
}
