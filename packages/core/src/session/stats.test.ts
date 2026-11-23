// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { sampleConnection, sampleFields } from "./stats";

const report = (stats: Record<string, unknown>[]) => new Map(stats.map((stat) => [stat.id, stat])) as unknown as RTCStatsReport;

const base = (local: string, bytes: number) => [
  { id: "T", type: "transport", selectedCandidatePairId: "P" },
  { id: "P", type: "candidate-pair", localCandidateId: "L", remoteCandidateId: "R", currentRoundTripTime: 0.042 },
  { id: "L", type: "local-candidate", candidateType: local, address: "10.0.0.2" },
  { id: "R", type: "remote-candidate", candidateType: "srflx", address: "203.0.113.9" },
  { id: "V", type: "inbound-rtp", kind: "video", packetsLost: 3, packetsReceived: 900, jitter: 0.004, framesPerSecond: 59, frameWidth: 1920, frameHeight: 1080, bytesReceived: bytes },
];

describe("sampleConnection", () => {
  it("summarizes the route, round trip, loss and bitrate", () => {
    const first = sampleConnection(report(base("host", 1_000_000)), 1000);
    const second = sampleConnection(report(base("host", 2_500_000)), 3000, first);
    expect(second).toMatchObject({ route: "direct", rttMs: 42, packetsLost: 3, jitterMs: 4, fps: 59, kbps: 6000 });
    expect(sampleFields(second)).toEqual({ route: "direct", rttMs: 42, lost: 3, received: 900, jitterMs: 4, fps: 59, size: "1920x1080", kbps: 6000 });
    expect(JSON.stringify(sampleFields(second))).not.toMatch(/10\.0|203\./);
  });

  it("calls a TURN path relayed", () => {
    expect(sampleConnection(report(base("relay", 1)), 1).route).toBe("relayed");
  });

  it("copes with an empty report", () => {
    expect(sampleConnection(report([]), 5)).toEqual({ at: 5 });
  });
});
