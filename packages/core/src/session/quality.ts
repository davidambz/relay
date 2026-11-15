// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { ContentHint } from "../platform";

export type StreamResolution = "native" | "1440" | "1080" | "720";
export type StreamFps = 30 | 60;

/** What the broadcaster picked: a resolution cap and a frame rate. */
export interface StreamQuality {
  resolution: StreamResolution;
  fps: StreamFps;
}

export const STREAM_RESOLUTIONS: readonly StreamResolution[] = ["native", "1440", "1080", "720"];
export const STREAM_FPS: readonly StreamFps[] = [60, 30];
export const DEFAULT_STREAM_QUALITY: StreamQuality = { resolution: "native", fps: 60 };

/** resizeMode is in the Media Capture spec and Chromium, but not in TS's DOM lib yet. */
export type VideoConstraints = MediaTrackConstraints & { resizeMode?: "none" | "crop-and-scale" };

export interface VideoProfile {
  /** For track.applyConstraints() on the captured video track. */
  constraints: VideoConstraints;
  contentHint: ContentHint;
  /** What WebRTC sacrifices first when bandwidth or CPU runs short. */
  degradationPreference: RTCDegradationPreference;
  /** Multiplier on the per-viewer bitrate cap (1 = 1080p60). */
  bitrateScale: number;
}

const HEIGHTS: Record<Exclude<StreamResolution, "native">, number> = { "1440": 1440, "1080": 1080, "720": 720 };

/**
 * Turns a quality choice into capture constraints and encoder settings.
 *
 * - 60 fps favours motion (games, video): under pressure WebRTC lowers
 *   resolution and keeps frames.
 * - 30 fps favours legibility (text, code): under pressure it drops frames
 *   and keeps resolution.
 *
 * Resolution is a cap (max height, scaled down keeping aspect ratio), so
 * a source smaller than the cap is never upscaled. The frame rate has to
 * be applied with applyConstraints after capture: Electron's
 * getDisplayMedia ignores frameRate and delivers 30 fps.
 */
export function videoProfileFor(quality: StreamQuality): VideoProfile {
  const motion = quality.fps === 60;
  const constraints: VideoConstraints = { frameRate: { ideal: quality.fps, max: quality.fps } };
  if (quality.resolution !== "native") {
    constraints.height = { max: HEIGHTS[quality.resolution] };
    constraints.resizeMode = "crop-and-scale";
  } else {
    constraints.resizeMode = "none";
  }
  const pixelScale: Record<StreamResolution, number> = { native: 1.3, "1440": 1.6, "1080": 1, "720": 0.6 };
  return {
    constraints,
    contentHint: motion ? "motion" : "detail",
    degradationPreference: motion ? "maintain-framerate" : "maintain-resolution",
    bitrateScale: pixelScale[quality.resolution] * (motion ? 1 : 0.7),
  };
}

export function isStreamQuality(value: unknown): value is StreamQuality {
  if (typeof value !== "object" || value === null) return false;
  const { resolution, fps } = value as Partial<StreamQuality>;
  return STREAM_RESOLUTIONS.includes(resolution as StreamResolution) && STREAM_FPS.includes(fps as StreamFps);
}

/**
 * Applies a quality choice to a live video track. Works mid-broadcast:
 * constraints change the track in place, so viewers keep their
 * connection and simply start receiving the new size/rate.
 */
export async function applyQualityToTrack(track: MediaStreamTrack, quality: StreamQuality): Promise<void> {
  const profile = videoProfileFor(quality);
  track.contentHint = profile.contentHint;
  await track.applyConstraints(profile.constraints);
}
