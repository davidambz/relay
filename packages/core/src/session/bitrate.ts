// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Per-viewer video bitrate cap. Every viewer is a separate encode and a
 * separate upload from the broadcaster's PC (mesh, no media server), so
 * the cap steps down as the audience grows to keep total upload sane.
 */
export function maxBitrateForViewers(viewerCount: number): number {
  // Sized for good home upload links (the intended audience); 1080p60
  // game footage is where the extra headroom shows. There's no viewer
  // limit by default, so past a handful it keeps stepping down: the
  // total upload grows far slower than the audience.
  if (viewerCount <= 2) return 12_000_000;
  if (viewerCount <= 4) return 10_000_000;
  if (viewerCount <= 6) return 8_000_000;
  if (viewerCount <= 10) return 6_000_000;
  return 4_000_000;
}

const POLL_INTERVAL_MS = 200;
const POLL_TIMEOUT_MS = 15_000;

export interface SenderSettings {
  maxBitrate: number;
  degradationPreference?: RTCDegradationPreference;
}

/**
 * Applies encoder settings to the video sender of a call. PeerJS creates
 * the RTCPeerConnection asynchronously and the sender has no encodings
 * until negotiation starts, so this polls briefly until there's something
 * to set. Resolves false if the call never got that far (it was closed,
 * or timed out).
 */
export async function applySenderSettings(
  getPeerConnection: () => RTCPeerConnection | null | undefined,
  settings: SenderSettings,
  isClosed: () => boolean = () => false,
): Promise<boolean> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline && !isClosed()) {
    const sender = getPeerConnection()
      ?.getSenders()
      .find((candidate) => candidate.track?.kind === "video");
    if (sender) {
      const parameters = sender.getParameters();
      if (parameters.encodings && parameters.encodings.length > 0) {
        parameters.encodings[0].maxBitrate = settings.maxBitrate;
        if (settings.degradationPreference) parameters.degradationPreference = settings.degradationPreference;
        await sender.setParameters(parameters);
        return true;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return false;
}
