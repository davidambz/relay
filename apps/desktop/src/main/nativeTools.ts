// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

/**
 * Finds one of the native helpers (native/<name>, built with CMake).
 * Packaged builds ship them under resources/bin; a dev checkout uses each
 * project's build folder. In dev, RELAY_<NAME> overrides that, for testing
 * a build that lives elsewhere; an installed copy only runs its own.
 * Returns null when the exe isn't there.
 */
export function resolveNativeTool(name: string): string | null {
  const override = app.isPackaged ? undefined : process.env[`RELAY_${name.toUpperCase()}`];
  const candidates = override
    ? [override]
    : app.isPackaged
      ? [path.join(process.resourcesPath, "bin", `${name}.exe`)]
      : [path.join(app.getAppPath(), "..", "..", "native", name, "build", `${name}.exe`)];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}
