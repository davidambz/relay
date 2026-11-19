// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "react";
import { usePlatform } from "../platform/PlatformContext";

const VOLUME_KEY = "player.volume";

function clampVolume(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : undefined;
}

export interface VolumeControls {
  volume: number;
  muted: boolean;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
}

interface Level {
  volume: number;
  muted: boolean;
}

/**
 * Volume and mute per watched broadcast (by code), so one can be turned
 * down without touching the others. The last volume set is remembered
 * through Platform.storage and is where a newly watched broadcast starts;
 * mute is per broadcast and not remembered.
 */
export function useVolumes(): (code: string) => VolumeControls {
  const { storage } = usePlatform();
  const [initial, setInitial] = useState(1);
  const [levels, setLevels] = useState<Record<string, Level>>({});

  useEffect(() => {
    let cancelled = false;
    void storage.get<number>(VOLUME_KEY).then((stored) => {
      const restored = clampVolume(stored);
      if (!cancelled && restored !== undefined) setInitial(restored);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const update = useCallback((code: string, change: (level: Level) => Level, fallback: number) => {
    setLevels((current) => ({ ...current, [code]: change(current[code] ?? { volume: fallback, muted: false }) }));
  }, []);

  return useCallback(
    (code: string): VolumeControls => {
      const level = levels[code] ?? { volume: initial, muted: false };
      const setVolume = (next: number) => {
        const volume = clampVolume(next) ?? 1;
        void storage.set(VOLUME_KEY, volume);
        // Dragging the slider up is an obvious "I want sound": unmute.
        update(code, (current) => ({ volume, muted: volume > 0 ? false : current.muted }), initial);
      };
      const setMuted = (muted: boolean) => update(code, (current) => ({ ...current, muted }), initial);
      return {
        ...level,
        setVolume,
        setMuted,
        toggleMuted: () => update(code, (current) => ({ ...current, muted: !current.muted }), initial),
      };
    },
    [levels, initial, storage, update],
  );
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
