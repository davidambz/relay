// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "react";
import { applyQualityToTrack, videoProfileFor, type StreamQuality } from "@relay/core";
import type { OnAir } from "../navigation";
import { useHostSession, type HostState } from "./useHostSession";

export interface StartedBroadcast {
  stream: MediaStream;
  sourceName: string;
  quality: StreamQuality;
}

export interface Broadcast {
  host: HostState;
  stream: MediaStream;
  sourceName: string;
  quality: StreamQuality;
  /** Whether the broadcast was started with sound (the track exists). */
  hasAudio: boolean;
  /** Sound on right now (muting disables the track, it isn't removed). */
  audioOn: boolean;
  /** Bumped when the stream's tracks are swapped for a new source. */
  sourceVersion: number;
  qualityError: boolean;
  switchError: boolean;
}

export interface BroadcastActions {
  setAudioOn: (on: boolean) => void;
  changeQuality: (quality: StreamQuality) => Promise<void>;
  /** Broadcasts another source under the same code; false if it failed. */
  switchSource: (next: StartedBroadcast) => Promise<boolean>;
}

interface Local {
  broadcast: StartedBroadcast | null;
  sourceName: string;
  quality: StreamQuality;
  audioOn: boolean;
  sourceVersion: number;
  qualityError: boolean;
  switchError: boolean;
}

function localFor(broadcast: StartedBroadcast | null): Local {
  return {
    broadcast,
    sourceName: broadcast?.sourceName ?? "",
    quality: broadcast?.quality ?? { resolution: "native", fps: 60 },
    audioOn: (broadcast?.stream.getAudioTracks().length ?? 0) > 0,
    sourceVersion: 0,
    qualityError: false,
    switchError: false,
  };
}

function encoderSettingsFor(quality: StreamQuality) {
  const { degradationPreference, bitrateScale } = videoProfileFor(quality);
  return { degradationPreference, bitrateScale };
}

interface BroadcastEvents {
  /** The captured source went away on its own (window closed). */
  onSourceEnded: () => void;
  /** Remember a quality change made mid-broadcast. */
  onQualityChange: (quality: StreamQuality) => void;
}

/**
 * The person's own broadcast, while there is one: its host session and
 * what can change mid-broadcast (sound, quality, source). Everything
 * resets when a new broadcast starts.
 */
export function useBroadcast(
  onAir: OnAir<StartedBroadcast> | null,
  { onSourceEnded, onQualityChange }: BroadcastEvents,
): [Broadcast | null, BroadcastActions] {
  const broadcast = onAir?.broadcast ?? null;
  const [local, setLocal] = useState<Local>(() => localFor(broadcast));
  if (local.broadcast !== broadcast) setLocal(localFor(broadcast));

  const stream = broadcast?.stream ?? null;
  const [host, { setEncoderSettings, replaceSource }] = useHostSession(
    stream,
    encoderSettingsFor(broadcast?.quality ?? local.quality),
    onAir?.attempt ?? 0,
  );

  // Closing the shared window ends its video track; end the broadcast with
  // it. Re-subscribed after a switch, to whichever source is live now.
  const { sourceVersion } = local;
  useEffect(() => {
    const [track] = stream?.getVideoTracks() ?? [];
    if (!track) return;
    const handleEnded = () => onSourceEnded();
    track.addEventListener("ended", handleEnded);
    return () => track.removeEventListener("ended", handleEnded);
  }, [stream, onSourceEnded, sourceVersion]);

  const setAudioOn = useCallback(
    (on: boolean) => {
      if (!stream) return;
      // Disabled rather than removed: nothing renegotiates, unmuting is instant.
      for (const track of stream.getAudioTracks()) track.enabled = on;
      setLocal((current) => ({ ...current, audioOn: on }));
    },
    [stream],
  );

  const changeQuality = useCallback(
    async (next: StreamQuality) => {
      if (!stream) return;
      setLocal((current) => ({ ...current, quality: next, qualityError: false }));
      onQualityChange(next);
      setEncoderSettings(encoderSettingsFor(next));
      const [track] = stream.getVideoTracks();
      if (!track) return;
      try {
        await applyQualityToTrack(track, next);
      } catch (error) {
        console.warn("Couldn't apply quality", error);
        setLocal((current) => ({ ...current, qualityError: true }));
      }
    },
    [stream, onQualityChange, setEncoderSettings],
  );

  const { audioOn, quality } = local;
  const switchSource = useCallback(
    async (next: StartedBroadcast) => {
      if (!stream) return false;
      const oldTracks = stream.getTracks();
      try {
        await replaceSource(next.stream);
      } catch (error) {
        console.error("Couldn't switch the source", error);
        for (const track of next.stream.getTracks()) track.stop();
        setLocal((current) => ({ ...current, switchError: true }));
        return false;
      }
      for (const track of oldTracks) track.stop();
      // Sound stays as the broadcaster left it (muted stays muted).
      for (const track of stream.getAudioTracks()) track.enabled = audioOn;
      if (next.quality.resolution !== quality.resolution || next.quality.fps !== quality.fps) {
        onQualityChange(next.quality);
      }
      // A new track: reapply encoder settings for its quality either way.
      setEncoderSettings(encoderSettingsFor(next.quality));
      setLocal((current) => ({
        ...current,
        sourceName: next.sourceName,
        quality: next.quality,
        switchError: false,
        sourceVersion: current.sourceVersion + 1,
      }));
      return true;
    },
    [stream, replaceSource, audioOn, quality, onQualityChange, setEncoderSettings],
  );

  const state: Broadcast | null =
    broadcast && local.broadcast === broadcast
      ? {
          host,
          stream: broadcast.stream,
          sourceName: local.sourceName,
          quality: local.quality,
          hasAudio: broadcast.stream.getAudioTracks().length > 0,
          audioOn: local.audioOn,
          sourceVersion: local.sourceVersion,
          qualityError: local.qualityError,
          switchError: local.switchError,
        }
      : null;
  return [state, { setAudioOn, changeQuality, switchSource }];
}
