// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "react";
import { usePlatform } from "../platform/PlatformContext";

const KEY = "broadcast.audio";

/** Whether broadcasts carry system audio (default on), remembered between sessions. */
export function useBroadcastAudio(): [boolean, (enabled: boolean) => void] {
  const { storage } = usePlatform();
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void storage.get<unknown>(KEY).then((stored) => {
      if (!cancelled && typeof stored === "boolean") setEnabledState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setEnabled = useCallback(
    (next: boolean) => {
      setEnabledState(next);
      void storage.set(KEY, next);
    },
    [storage],
  );

  return [enabled, setEnabled];
}
