// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import { app } from "electron";

const MAX_INSTANCES = 9;

/**
 * Lets several copies of Relay run side by side (e.g. one broadcasting and
 * one watching, to test alone). Chromium can't share a profile between
 * two live processes, so each extra copy gets its own userData folder.
 *
 * Electron's single-instance lock is tied to the current userData path,
 * so we use it as a probe: try the default profile, then "instance-2",
 * "instance-3"... and keep the first one nobody holds. We never quit on a
 * failed lock; that's the point. Must run before app "ready".
 */
export function claimInstanceProfile(): number {
  const base = app.getPath("userData");
  for (let number = 1; number <= MAX_INSTANCES; number++) {
    if (number > 1) {
      app.setPath("userData", path.join(base, `instance-${number}`));
    }
    if (app.requestSingleInstanceLock()) {
      return number;
    }
  }
  // Absurd case: every slot taken. Fall back to a throwaway per-process profile.
  app.setPath("userData", path.join(base, `instance-pid-${process.pid}`));
  return MAX_INSTANCES + 1;
}
