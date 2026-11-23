// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState } from "react";
import type { UpdateStatus } from "@relay/core";
import { usePlatform } from "../platform/PlatformContext";

/** The shell's self-update status, live; "idle" where there's no self-update. */
export function useUpdateStatus(): UpdateStatus {
  const platform = usePlatform();
  const updates = platform.capabilities.selfUpdate ? platform.updates : undefined;
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });

  useEffect(() => {
    if (!updates) return;
    let cancelled = false;
    let pushed = false;
    // A pushed status is always newer than the initial snapshot, so a slow
    // getStatus() must not overwrite one.
    const unsubscribe = updates.onStatus((next) => {
      pushed = true;
      setStatus(next);
    });
    void updates.getStatus().then((current) => {
      if (!cancelled && !pushed) setStatus(current);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [updates]);

  return status;
}
