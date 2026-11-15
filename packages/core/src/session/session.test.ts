// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULT_SESSION_CONFIG, type SessionConfig } from "./config";
import { HostSession, HostSessionError } from "./host";
import { enableOpusStereo } from "./sdp";
import { FakeNetwork, type FakeMediaConnection } from "./testing/fakePeer";
import { VIEWER_STREAM_TIMEOUT_MS, ViewerSession, type ViewerEndReason } from "./viewer";

const stream = { id: "host-stream" } as unknown as MediaStream;
// A few macrotask turns: enough for connections to open and the fake
// senders' async setParameters to settle.
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const config = (overrides: Partial<SessionConfig> = {}): SessionConfig => ({ ...DEFAULT_SESSION_CONFIG, ...overrides });

function codes(...values: string[]) {
  let index = 0;
  return () => values[index++] ?? "ZZZZZZ";
}

function watch(network: FakeNetwork, code: string) {
  const result: { stream?: MediaStream; ended?: ViewerEndReason } = {};
  const session = new ViewerSession(code, config(), network.factory, {
    onStream: (received) => (result.stream = received),
    onEnd: (reason) => (result.ended = reason),
  });
  session.connect();
  return { session, result };
}

describe("HostSession", () => {
  it("claims a code on the signaling server", async () => {
    const network = new FakeNetwork();
    const host = new HostSession(stream, config(), network.factory, { makeCode: codes("ABC234") });
    await expect(host.start()).resolves.toBe("ABC234");
    expect(network.peers.has("relay-tenno-v1-ABC234")).toBe(true);
    expect(host.code).toBe("ABC234");
  });

  it("retries with a new code when one is taken", async () => {
    const network = new FakeNetwork();
    network.occupy("relay-tenno-v1-AAAAAA");
    const host = new HostSession(stream, config(), network.factory, { makeCode: codes("AAAAAA", "BBBBBB") });
    await expect(host.start()).resolves.toBe("BBBBBB");
    expect(network.created[0].destroyed).toBe(true);
  });

  it("gives up after five taken codes", async () => {
    const network = new FakeNetwork();
    for (const code of ["AAAAAA", "BBBBBB", "CCCCCC", "DDDDDD", "EEEEEE"]) network.occupy(`relay-tenno-v1-${code}`);
    const host = new HostSession(stream, config(), network.factory, { makeCode: codes("AAAAAA", "BBBBBB", "CCCCCC", "DDDDDD", "EEEEEE") });
    await expect(host.start()).rejects.toMatchObject({ type: "unavailable-id" });
  });

  it("rejects when the signaling server is unreachable", async () => {
    const network = new FakeNetwork();
    network.offline = true;
    const host = new HostSession(stream, config(), network.factory);
    await expect(host.start()).rejects.toBeInstanceOf(HostSessionError);
  });

  it("rejects start() if stopped while claiming a code", async () => {
    const network = new FakeNetwork();
    const host = new HostSession(stream, config(), network.factory);
    const starting = host.start();
    host.stop();
    await expect(starting).rejects.toMatchObject({ type: "stopped" });
  });
});

describe("host and viewer together", () => {
  it("streams to a viewer and tracks the count", async () => {
    const network = new FakeNetwork();
    const viewerLists: string[][] = [];
    const host = new HostSession(stream, config(), network.factory, { onViewersChange: (ids) => viewerLists.push(ids), makeCode: codes("ABC234") });
    await host.start();

    const { result } = watch(network, "ABC234");
    await flush();
    expect(result.stream).toBe(stream);
    expect(viewerLists.at(-1)).toHaveLength(1);
  });

  it("applies Opus stereo on both the offer and the answer", async () => {
    const network = new FakeNetwork();
    const host = new HostSession(stream, config(), network.factory, { makeCode: codes("ABC234") });
    await host.start();
    watch(network, "ABC234");
    await flush();
    const hostCall = network.peers.get("relay-tenno-v1-ABC234")!.calls[0];
    const opus = "a=rtpmap:111 opus/48000/2\na=fmtp:111 minptime=10\n";
    expect(hostCall.sdpTransform!(opus)).toBe(enableOpusStereo(opus));
    expect((hostCall.remote as FakeMediaConnection).sdpTransform!(opus)).toBe(enableOpusStereo(opus));
  });

  it("applies the quality mode's degradation preference", async () => {
    const network = new FakeNetwork();
    const host = new HostSession(stream, config(), network.factory, { makeCode: codes("ABC234"), degradationPreference: "maintain-framerate" });
    await host.start();
    watch(network, "ABC234");
    await flush();
    const sender = network.peers.get("relay-tenno-v1-ABC234")!.calls[0].sender;
    expect(sender.degradation).toEqual(["maintain-framerate"]);
  });

  it("changes encoder settings for current viewers mid-broadcast", async () => {
    const network = new FakeNetwork();
    const host = new HostSession(stream, config(), network.factory, { makeCode: codes("ABC234") });
    await host.start();
    watch(network, "ABC234");
    await flush();
    host.setEncoderSettings({ bitrateScale: 0.5, degradationPreference: "maintain-resolution" });
    await flush();
    const sender = network.peers.get("relay-tenno-v1-ABC234")!.calls[0].sender;
    expect(sender.applied.at(-1)).toBe(6_000_000);
    expect(sender.degradation.at(-1)).toBe("maintain-resolution");
  });

  it("steps the bitrate down as viewers join", async () => {
    const network = new FakeNetwork();
    const host = new HostSession(stream, config(), network.factory, { makeCode: codes("ABC234") });
    await host.start();
    for (let i = 0; i < 3; i++) watch(network, "ABC234");
    await flush();
    await flush();
    const firstCall = network.peers.get("relay-tenno-v1-ABC234")!.calls[0];
    // The newest cap wins, and updates to one sender never overlap.
    expect(firstCall.sender.applied.at(-1)).toBe(10_000_000);
    expect(firstCall.sender.maxConcurrent).toBe(1);
  });

  it("has no viewer limit by default", async () => {
    const network = new FakeNetwork();
    const viewerLists: string[][] = [];
    const host = new HostSession(stream, config(), network.factory, { onViewersChange: (ids) => viewerLists.push(ids), makeCode: codes("ABC234") });
    await host.start();
    const watchers = Array.from({ length: 12 }, () => watch(network, "ABC234"));
    await flush();
    expect(viewerLists.at(-1)).toHaveLength(12);
    expect(watchers.every(({ result }) => result.stream === stream && result.ended === undefined)).toBe(true);
  });

  it("turns away viewers past an optional limit", async () => {
    const network = new FakeNetwork();
    const viewerLists: string[][] = [];
    const host = new HostSession(stream, config({ maxViewers: 1 }), network.factory, { onViewersChange: (ids) => viewerLists.push(ids), makeCode: codes("ABC234") });
    await host.start();
    const first = watch(network, "ABC234");
    await flush();
    const second = watch(network, "ABC234");
    await flush();
    expect(second.result.ended).toBe("full");
    expect(second.result.stream).toBeUndefined();
    expect(first.result.ended).toBeUndefined();
    expect(viewerLists.at(-1)).toHaveLength(1);
  });

  it("doesn't connect twice when the viewer's signaling reconnects", async () => {
    const network = new FakeNetwork();
    const viewerLists: string[][] = [];
    const host = new HostSession(stream, config(), network.factory, { onViewersChange: (ids) => viewerLists.push(ids), makeCode: codes("ABC234") });
    await host.start();
    const { result } = watch(network, "ABC234");
    await flush();
    const viewerPeer = network.created.find((peer) => peer.id.startsWith("auto-"))!;
    viewerPeer.emit("disconnected");
    await flush();
    expect(network.peers.get("relay-tenno-v1-ABC234")!.calls).toHaveLength(1);
    expect(viewerLists.at(-1)).toHaveLength(1);
    expect(result.ended).toBeUndefined();
  });

  it("replaces a viewer that connects again without counting it twice", async () => {
    const network = new FakeNetwork();
    const viewerLists: string[][] = [];
    const host = new HostSession(stream, config(), network.factory, { onViewersChange: (ids) => viewerLists.push(ids), makeCode: codes("ABC234") });
    await host.start();
    watch(network, "ABC234");
    await flush();
    const viewerPeer = network.created.find((peer) => peer.id.startsWith("auto-"))!;
    const firstConn = viewerPeer.connections[0];
    viewerPeer.connect("relay-tenno-v1-ABC234");
    await flush();
    const hostCalls = network.peers.get("relay-tenno-v1-ABC234")!.calls;
    expect(hostCalls).toHaveLength(2);
    expect(viewerLists.at(-1)).toHaveLength(1);
    // Late events from the replaced connection don't drop its successor.
    firstConn.close();
    await flush();
    expect(viewerLists.at(-1)).toHaveLength(1);
  });

  it("drops a viewer from the count when they leave", async () => {
    const network = new FakeNetwork();
    const viewerLists: string[][] = [];
    const host = new HostSession(stream, config(), network.factory, { onViewersChange: (ids) => viewerLists.push(ids), makeCode: codes("ABC234") });
    await host.start();
    const { session } = watch(network, "ABC234");
    await flush();
    session.leave();
    await flush();
    expect(viewerLists.at(-1)).toEqual([]);
  });

  it("ends every viewer when the host stops", async () => {
    vi.useFakeTimers();
    try {
      const network = new FakeNetwork();
      const host = new HostSession(stream, config(), network.factory, { makeCode: codes("ABC234") });
      const starting = host.start();
      await vi.advanceTimersByTimeAsync(0);
      await starting;
      const { result } = watch(network, "ABC234");
      await vi.advanceTimersByTimeAsync(0);
      host.stop();
      await vi.advanceTimersByTimeAsync(500);
      expect(result.ended).toBe("ended");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ViewerSession", () => {
  it("reports an unknown code as not found", async () => {
    const network = new FakeNetwork();
    const { result } = watch(network, "NXPE23");
    await flush();
    expect(result.ended).toBe("not-found");
  });

  it("times out when no stream arrives", async () => {
    vi.useFakeTimers();
    try {
      const network = new FakeNetwork();
      // A peer that accepts connections but never calls back.
      network.occupy("relay-tenno-v1-QUXET2");
      const { result } = watch(network, "QUXET2");
      await vi.advanceTimersByTimeAsync(VIEWER_STREAM_TIMEOUT_MS - 1);
      expect(result.ended).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(result.ended).toBe("timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports an unreachable signaling server", async () => {
    const network = new FakeNetwork();
    network.offline = true;
    const { result } = watch(network, "ABC234");
    await flush();
    expect(result.ended).toBe("network");
  });
});
