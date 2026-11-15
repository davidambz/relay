// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Per-viewer video bitrate cap. Every viewer is a separate encode and a
 * separate upload from the broadcaster's PC (mesh, no media server), so
 * the cap steps down as the audience grows to keep total upload sane.
 */
export function maxBitrateForViewers(viewerCount: number): number {
  if (viewerCount <= 2) return 6_000_000;
  if (viewerCount <= 4) return 4_000_000;
  return 3_000_000;
}

const POLL_INTERVAL_MS = 200;
const POLL_TIMEOUT_MS = 15_000;

/**
 * Applies a max bitrate to the video sender of a call. PeerJS creates the
 * RTCPeerConnection asynchronously and the sender has no encodings until
 * negotiation starts, so this polls briefly until there's something to set.
 * Resolves false if the call never got that far (it was closed, or timed out).
 */
export async function applyMaxBitrate(
  getPeerConnection: () => RTCPeerConnection | null | undefined,
  maxBitrate: number,
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
        parameters.encodings[0].maxBitrate = maxBitrate;
        await sender.setParameters(parameters);
        return true;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return false;
}
