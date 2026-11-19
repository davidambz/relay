// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

export interface Volumes {
  /** The controls for one watched broadcast (its volume and mute). */
  controlsFor: (code: string) => VolumeControls;
  /** Stable across renders: safe to use in effects. */
  toggleMuted: (code: string) => void;
}

/**
 * Volume and mute per watched broadcast (by code), so one can be turned
 * down without touching the others. The last volume set is remembered
 * through Platform.storage and is where a newly watched broadcast starts.
 * Mute is per broadcast; a broadcast that's left is forgotten, so
 * watching it again starts fresh.
 */
export function useVolumes(codes: readonly string[]): Volumes {
  const { storage } = usePlatform();
  const [initial, setInitial] = useState(1);
  const initialRef = useRef(initial);
  useLayoutEffect(() => {
    initialRef.current = initial;
  }, [initial]);
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

  // Forget the broadcasts no longer watched, as soon as the list changes.
  const [prunedFor, setPrunedFor] = useState(codes);
  if (prunedFor !== codes) {
    setPrunedFor(codes);
    const stale = Object.keys(levels).filter((code) => !codes.includes(code));
    if (stale.length > 0) {
      const next = { ...levels };
      for (const code of stale) delete next[code];
      setLevels(next);
    }
  }

  const update = useCallback((code: string, change: (level: Level) => Level) => {
    setLevels((current) => ({
      ...current,
      [code]: change(current[code] ?? { volume: initialRef.current, muted: false }),
    }));
  }, []);

  const setVolume = useCallback(
    (code: string, next: number) => {
      const volume = clampVolume(next) ?? 1;
      void storage.set(VOLUME_KEY, volume);
      setInitial(volume);
      // Dragging the slider up is an obvious "I want sound": unmute.
      update(code, (current) => ({ volume, muted: volume > 0 ? false : current.muted }));
    },
    [storage, update],
  );
  const setMuted = useCallback((code: string, muted: boolean) => update(code, (current) => ({ ...current, muted })), [update]);
  const toggleMuted = useCallback(
    (code: string) => update(code, (current) => ({ ...current, muted: !current.muted })),
    [update],
  );

  const controlsFor = useCallback(
    (code: string): VolumeControls => ({
      ...(levels[code] ?? { volume: initial, muted: false }),
      setVolume: (next) => setVolume(code, next),
      setMuted: (muted) => setMuted(code, muted),
      toggleMuted: () => toggleMuted(code),
    }),
    [levels, initial, setVolume, setMuted, toggleMuted],
  );

  return useMemo(() => ({ controlsFor, toggleMuted }), [controlsFor, toggleMuted]);
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
