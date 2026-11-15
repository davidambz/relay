// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { ContentHint } from "../platform";

export interface VideoProfile {
  frameRate: { ideal: number; max: number };
  /** What WebRTC sacrifices first when bandwidth or CPU runs short. */
  degradationPreference: RTCDegradationPreference;
}

/**
 * Sharpness (text, code): 30 fps is plenty, and under pressure drop
 * frames rather than resolution so text stays legible.
 * Smoothness (games, video): up to 60 fps, and under pressure drop
 * resolution rather than frames so motion stays fluid.
 */
export function videoProfileFor(hint: ContentHint): VideoProfile {
  return hint === "motion"
    ? { frameRate: { ideal: 60, max: 60 }, degradationPreference: "maintain-framerate" }
    : { frameRate: { ideal: 30, max: 30 }, degradationPreference: "maintain-resolution" };
}
