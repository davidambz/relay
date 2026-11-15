// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "react";
import { usePlatform } from "../platform/PlatformContext";

const VOLUME_KEY = "player.volume";
const MUTED_KEY = "player.muted";

function clampVolume(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : undefined;
}

/** Volume and mute, remembered across sessions through Platform.storage. */
export function useVolume() {
  const { storage } = usePlatform();
  const [volume, setVolumeState] = useState(1);
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([storage.get<number>(VOLUME_KEY), storage.get<boolean>(MUTED_KEY)]).then(([storedVolume, storedMuted]) => {
      if (cancelled) return;
      const restored = clampVolume(storedVolume);
      if (restored !== undefined) setVolumeState(restored);
      if (typeof storedMuted === "boolean") setMutedState(storedMuted);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setVolume = useCallback(
    (next: number) => {
      const value = clampVolume(next) ?? 1;
      setVolumeState(value);
      void storage.set(VOLUME_KEY, value);
      // Dragging the slider up is an obvious "I want sound": unmute.
      if (value > 0) {
        setMutedState(false);
        void storage.set(MUTED_KEY, false);
      }
    },
    [storage],
  );

  const setMuted = useCallback(
    (next: boolean) => {
      setMutedState(next);
      void storage.set(MUTED_KEY, next);
    },
    [storage],
  );

  return { volume, muted, setVolume, setMuted, toggleMuted: () => setMuted(!muted) };
}

/**
 * Some platforms (iOS) ignore HTMLMediaElement.volume entirely; there the
 * slider would do nothing, so only mute is offered.
 */
export function canSetVolume(): boolean {
  const probe = document.createElement("video");
  probe.volume = 0.5;
  return probe.volume === 0.5;
}
