// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_STREAM_QUALITY, isStreamQuality, type StreamQuality } from "@relay/core";
import { usePlatform } from "../platform/PlatformContext";

const KEY = "broadcast.quality";

/** The broadcaster's last resolution/FPS choice, remembered between sessions. */
export function useStreamQuality(): [StreamQuality, (quality: StreamQuality) => void] {
  const { storage } = usePlatform();
  const [quality, setQualityState] = useState<StreamQuality>(DEFAULT_STREAM_QUALITY);

  useEffect(() => {
    let cancelled = false;
    void storage.get<unknown>(KEY).then((stored) => {
      if (!cancelled && isStreamQuality(stored)) setQualityState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setQuality = useCallback(
    (next: StreamQuality) => {
      setQualityState(next);
      void storage.set(KEY, next);
    },
    [storage],
  );

  return [quality, setQuality];
}
