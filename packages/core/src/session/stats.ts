// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

// A viewer connection's health in a few numbers, from getStats(), kept
// so that when it drops the log says what it looked like just before:
// bad internet (loss, high round trip) reads differently from a bug.

export interface ConnectionSample {
  /** When it was taken (ms). */
  at: number;
  /** Peer to peer, or through a TURN server. */
  route?: "direct" | "relayed";
  rttMs?: number;
  packetsLost?: number;
  packetsReceived?: number;
  jitterMs?: number;
  fps?: number;
  width?: number;
  height?: number;
  bytesReceived?: number;
  /** Since the previous sample. */
  kbps?: number;
}

type Stat = Record<string, unknown> & { type?: string; id?: string };

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Summarizes a getStats() report of a receive-only call. */
export function sampleConnection(report: RTCStatsReport, at: number, previous?: ConnectionSample): ConnectionSample {
  const stats = new Map<string, Stat>();
  report.forEach((stat: Stat) => stats.set(String(stat.id), stat));
  const sample: ConnectionSample = { at };

  let pair: Stat | undefined;
  for (const stat of stats.values()) {
    if (stat.type === "transport" && typeof stat.selectedCandidatePairId === "string") {
      pair = stats.get(stat.selectedCandidatePairId);
    }
  }
  pair ??= [...stats.values()].find((stat) => stat.type === "candidate-pair" && stat.nominated && stat.state === "succeeded");
  if (pair) {
    const rtt = num(pair.currentRoundTripTime);
    if (rtt !== undefined) sample.rttMs = Math.round(rtt * 1000);
    const types = [pair.localCandidateId, pair.remoteCandidateId].map((id) => stats.get(String(id))?.candidateType);
    if (types.every((type) => typeof type === "string")) {
      sample.route = types.includes("relay") ? "relayed" : "direct";
    }
  }

  const video = [...stats.values()].find((stat) => stat.type === "inbound-rtp" && stat.kind === "video");
  if (video) {
    sample.packetsLost = num(video.packetsLost);
    sample.packetsReceived = num(video.packetsReceived);
    const jitter = num(video.jitter);
    if (jitter !== undefined) sample.jitterMs = Math.round(jitter * 1000);
    sample.fps = num(video.framesPerSecond);
    sample.width = num(video.frameWidth);
    sample.height = num(video.frameHeight);
    sample.bytesReceived = num(video.bytesReceived);
    if (previous?.bytesReceived !== undefined && sample.bytesReceived !== undefined && at > previous.at) {
      sample.kbps = Math.round(((sample.bytesReceived - previous.bytesReceived) * 8) / (at - previous.at));
    }
  }
  return sample;
}

/** The sample as log fields (no ids, no addresses). */
export function sampleFields(sample: ConnectionSample | undefined): Record<string, string | number | undefined> {
  if (!sample) return {};
  return {
    route: sample.route,
    rttMs: sample.rttMs,
    lost: sample.packetsLost,
    received: sample.packetsReceived,
    jitterMs: sample.jitterMs,
    fps: sample.fps,
    size: sample.width && sample.height ? `${sample.width}x${sample.height}` : undefined,
    kbps: sample.kbps,
  };
}
