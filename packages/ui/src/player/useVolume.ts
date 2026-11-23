// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePlatform } from "../platform/PlatformContext";

const VOLUME_KEY = "player.volume";
const MUTED_KEY = "player.muted";
const LEVELS_KEY = "player.levels";
/** Broadcasts whose level is remembered; codes change every time someone goes live. */
const REMEMBERED_CODES = 20;

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

function parseLevels(value: unknown): Record<string, Level> {
  const levels: Record<string, Level> = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return levels;
  for (const [code, level] of Object.entries(value as Record<string, unknown>)) {
    const volume = clampVolume((level as Partial<Level> | null)?.volume);
    const muted = (level as Partial<Level> | null)?.muted;
    if (volume !== undefined && typeof muted === "boolean") levels[code] = { volume, muted };
  }
  return levels;
}

/** The newest REMEMBERED_CODES entries (object keys keep insertion order). */
function trimmed(levels: Record<string, Level>): Record<string, Level> {
  const entries = Object.entries(levels);
  return Object.fromEntries(entries.slice(Math.max(0, entries.length - REMEMBERED_CODES)));
}

/**
 * Volume and mute per watched broadcast (by code), so one can be turned
 * down without touching the others, remembered through Platform.storage:
 *
 * - Each broadcast keeps its own level, so coming back to the same code
 *   (or reconnecting to it) finds it as it was left.
 * - A broadcast not heard before starts at the last volume set and the
 *   last mute choice. Mute only becomes that default while the broadcast
 *   is the only one open: muting one of several to hear another says
 *   nothing about the next one.
 */
export function useVolumes(codes: readonly string[]): Volumes {
  const { storage } = usePlatform();
  const [initial, setInitial] = useState<Level>({ volume: 1, muted: false });
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [loaded, setLoaded] = useState(false);
  // Changes read the newest values, not the ones of the last render: two
  // changes can land before React renders again (a key held down).
  const initialRef = useRef(initial);
  const levelsRef = useRef(levels);
  useLayoutEffect(() => {
    initialRef.current = initial;
    levelsRef.current = levels;
  }, [initial, levels]);

  const codesRef = useRef(codes);
  useLayoutEffect(() => {
    codesRef.current = codes;
  }, [codes]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([storage.get<unknown>(VOLUME_KEY), storage.get<unknown>(MUTED_KEY), storage.get<unknown>(LEVELS_KEY)]).then(
      ([volume, muted, stored]) => {
        if (cancelled) return;
        initialRef.current = {
          volume: clampVolume(volume) ?? initialRef.current.volume,
          muted: typeof muted === "boolean" ? muted : initialRef.current.muted,
        };
        setInitial(initialRef.current);
        // Anything changed before the stored levels arrived wins.
        levelsRef.current = { ...parseLevels(stored), ...levelsRef.current };
        setLevels(levelsRef.current);
        setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [storage]);

  // A broadcast that just joined takes the defaults as they are now, so
  // changing another one's volume later doesn't move it too. In memory
  // only: it's saved once it's actually changed.
  const [pinnedFor, setPinnedFor] = useState<{ codes: readonly string[]; loaded: boolean } | null>(null);
  if (loaded && (pinnedFor?.codes !== codes || !pinnedFor.loaded)) {
    setPinnedFor({ codes, loaded });
    const missing = codes.filter((code) => !(code in levels));
    if (missing.length > 0) {
      const next = { ...levels };
      for (const code of missing) next[code] = initial;
      setLevels(next);
    }
  }

  const update = useCallback(
    (code: string, change: (level: Level) => Level) => {
      const current = levelsRef.current;
      const level = change(current[code] ?? initialRef.current);
      // Re-inserted last, so it's the newest when trimming.
      const { [code]: _previous, ...rest } = current;
      const next = trimmed({ ...rest, [code]: level });
      levelsRef.current = next;
      setLevels(next);
      void storage.set(LEVELS_KEY, next);
      if (codesRef.current.length <= 1 && codesRef.current.includes(code)) {
        initialRef.current = { ...initialRef.current, muted: level.muted };
        setInitial(initialRef.current);
        void storage.set(MUTED_KEY, level.muted);
      }
    },
    [storage],
  );

  const setVolume = useCallback(
    (code: string, next: number) => {
      const volume = clampVolume(next) ?? 1;
      void storage.set(VOLUME_KEY, volume);
      initialRef.current = { ...initialRef.current, volume };
      setInitial(initialRef.current);
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
      ...(levels[code] ?? initial),
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
