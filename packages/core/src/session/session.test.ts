// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULT_SESSION_CONFIG, type SessionConfig } from "./config";
import { HostSession, HostSessionError, VIEWER_DISCONNECT_GRACE_MS } from "./host";
import { enableOpusStereo } from "./sdp";
import { FakeNetwork, FakeStream, type FakeMediaConnection, type FakePeer } from "./testing/fakePeer";
import {
  HOST_GONE_MS,
  MEDIA_GRACE_MS,
  RECONNECT_ATTEMPT_MS,
  RECONNECT_DEADLINE_MS,
  signalingBackoffMs,
  VIEWER_STREAM_TIMEOUT_MS,
  ViewerSession,
  type ViewerEndReason,
} from "./viewer";

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

/** A viewer app that answers and then never does anything again (e.g. it froze or was killed). */
async function bareViewer(network: FakeNetwork, code: string) {
  const peer = network.factory(undefined, { iceServers: [] }) as FakePeer;
  await flush();
  peer.on("call", (call: FakeMediaConnection) => call.answer());
  peer.connect(`relay-tenno-v1-${code}`);
  return peer;
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
    const viewerPeer = await bareViewer(network, "ABC234");
    await flush();
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

  it("switches every viewer to a new source without reconnecting", async () => {
    const network = new FakeNetwork();
    const live = new FakeStream("live", [{ kind: "video", id: "v1" }, { kind: "audio", id: "a1" }]);
    const host = new HostSession(live as unknown as MediaStream, config(), network.factory, { makeCode: codes("ABC234") });
    await host.start();
    const first = watch(network, "ABC234");
    await flush();
    const next = new FakeStream("next", [{ kind: "video", id: "v2" }, { kind: "audio", id: "a2" }]);
    await host.replaceSource(next as unknown as MediaStream);

    const call = network.peers.get("relay-tenno-v1-ABC234")!.calls[0];
    expect(call.sender.replaced.map((track) => track?.id)).toEqual(["v2"]);
    expect(call.audioSender!.replaced.map((track) => track?.id)).toEqual(["a2"]);
    // The same stream object now carries the new tracks, for later viewers.
    expect(live.getTracks().map((track) => track.id)).toEqual(["v2", "a2"]);
    expect(host.code).toBe("ABC234");
    expect(first.result.ended).toBeUndefined();
  });

  it("silences sound when the new source has none, and never adds sound a broadcast didn't have", async () => {
    const network = new FakeNetwork();
    const withSound = new FakeStream("a", [{ kind: "video", id: "v1" }, { kind: "audio", id: "a1" }]);
    const host = new HostSession(withSound as unknown as MediaStream, config(), network.factory, { makeCode: codes("ABC234") });
    await host.start();
    watch(network, "ABC234");
    await flush();
    await host.replaceSource(new FakeStream("b", [{ kind: "video", id: "v2" }]) as unknown as MediaStream);
    const call = network.peers.get("relay-tenno-v1-ABC234")!.calls[0];
    expect(call.audioSender!.replaced).toEqual([null]);

    const network2 = new FakeNetwork();
    const silent = new FakeStream("c", [{ kind: "video", id: "v1" }]);
    const host2 = new HostSession(silent as unknown as MediaStream, config(), network2.factory, { makeCode: codes("ABC234") });
    await host2.start();
    watch(network2, "ABC234");
    await flush();
    await host2.replaceSource(new FakeStream("d", [{ kind: "video", id: "v2" }, { kind: "audio", id: "a2" }]) as unknown as MediaStream);
    expect(silent.getTracks().map((track) => track.id)).toEqual(["v2"]);
    expect(network2.peers.get("relay-tenno-v1-ABC234")!.calls[0].audioSender).toBeNull();
  });

  it("drops a viewer whose connection dies without a goodbye", async () => {
    vi.useFakeTimers();
    try {
      const network = new FakeNetwork();
      const viewerLists: string[][] = [];
      const host = new HostSession(stream, config(), network.factory, { onViewersChange: (ids) => viewerLists.push(ids), makeCode: codes("ABC234") });
      const starting = host.start();
      await vi.advanceTimersByTimeAsync(0);
      await starting;
      for (let i = 0; i < 3; i++) void bareViewer(network, "ABC234");
      await vi.advanceTimersByTimeAsync(500); // joined, health watch attached
      const [closedApp, hiccup, failed] = network.peers.get("relay-tenno-v1-ABC234")!.calls;
      expect(viewerLists.at(-1)).toHaveLength(3);

      closedApp.setConnectionState("disconnected");
      hiccup.setConnectionState("disconnected");
      failed.setConnectionState("failed");
      expect(viewerLists.at(-1)).toHaveLength(2); // failed: gone at once
      await vi.advanceTimersByTimeAsync(VIEWER_DISCONNECT_GRACE_MS / 2);
      hiccup.setConnectionState("connected"); // a brief blip keeps the seat
      await vi.advanceTimersByTimeAsync(VIEWER_DISCONNECT_GRACE_MS);
      expect(viewerLists.at(-1)).toHaveLength(1);
      expect(viewerLists.at(-1)![0]).toBe(hiccup.peer);
    } finally {
      vi.useRealTimers();
    }
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

describe("session log", () => {
  it("logs the broadcast and the viewer without full codes", async () => {
    const network = new FakeNetwork();
    const entries: string[] = [];
    const log = (entry: { scope: string; message: string; data?: Record<string, unknown> }) =>
      entries.push(`${entry.scope}:${entry.message}:${JSON.stringify(entry.data)}`);
    const host = new HostSession(stream, config(), network.factory, { makeCode: codes("ABC234"), log });
    await host.start();
    const viewer = new ViewerSession("ABC234", config(), network.factory, { log });
    viewer.connect();
    await vi.waitFor(() => expect(entries.some((line) => line.startsWith("viewer:Playing"))).toBe(true));
    viewer.leave();
    host.stop();
    expect(entries.join("\n")).not.toContain("ABC234");
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^host:On air:.*"ABC•••"/),
        expect.stringMatching(/^host:Viewer joined:.*"viewers":1/),
        expect.stringMatching(/^viewer:Ended:.*"reason":"left"/),
        expect.stringMatching(/^host:Stopped/),
      ]),
    );
  });
});

describe("ViewerSession reconnecting", () => {
  async function playing(network: FakeNetwork) {
    const host = new HostSession(stream, config(), network.factory, { makeCode: codes("ABC234") });
    const starting = host.start();
    await vi.advanceTimersByTimeAsync(0);
    await starting;
    const streams: MediaStream[] = [];
    let reconnecting = 0;
    const result: { ended?: ViewerEndReason } = {};
    const session = new ViewerSession("ABC234", config(), network.factory, {
      onStream: (s) => streams.push(s),
      onReconnecting: () => reconnecting++,
      onEnd: (reason) => (result.ended = reason),
    });
    session.connect();
    await vi.advanceTimersByTimeAsync(0);
    const viewerPeer = network.created.find((peer) => peer.id.startsWith("auto-"))!;
    return { host, session, streams, result, viewerPeer, reconnects: () => reconnecting };
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps playing through a signaling outage and reconnects with growing waits", async () => {
    const network = new FakeNetwork();
    const { streams, result, viewerPeer, reconnects } = await playing(network);
    expect(streams).toHaveLength(1);
    network.offline = true;
    const reconnect = vi.spyOn(viewerPeer, "reconnect");
    viewerPeer.loseSignaling();
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000);
    expect(reconnect).toHaveBeenCalledTimes(3);
    network.offline = false;
    await vi.advanceTimersByTimeAsync(8000);
    expect(reconnect).toHaveBeenCalledTimes(4);
    expect(viewerPeer.disconnected).toBe(false);
    expect(result.ended).toBeUndefined();
    expect(reconnects()).toBe(0);
    expect(streams).toHaveLength(1);
  });

  it("gets the picture back by itself when the media drops", async () => {
    const network = new FakeNetwork();
    const { streams, result, viewerPeer, reconnects } = await playing(network);
    const viewerCall = viewerPeer.connections.find((connection) => "answered" in connection) as FakeMediaConnection;
    viewerCall.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(reconnects()).toBe(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(streams).toHaveLength(2);
    expect(result.ended).toBeUndefined();
  });

  it("treats a long media 'disconnected' as a drop, and a short one as a blip", async () => {
    const network = new FakeNetwork();
    const { reconnects, viewerPeer } = await playing(network);
    const viewerCall = () => viewerPeer.connections.filter((connection) => "answered" in connection).at(-1) as FakeMediaConnection;
    viewerCall().setConnectionState("disconnected");
    await vi.advanceTimersByTimeAsync(MEDIA_GRACE_MS - 1000);
    viewerCall().setConnectionState("connected");
    await vi.advanceTimersByTimeAsync(MEDIA_GRACE_MS);
    expect(reconnects()).toBe(0);
    viewerCall().setConnectionState("disconnected");
    await vi.advanceTimersByTimeAsync(MEDIA_GRACE_MS);
    expect(reconnects()).toBe(1);
  });

  it("ends right away when the broadcaster says goodbye", async () => {
    const network = new FakeNetwork();
    const { host, result, reconnects } = await playing(network);
    host.stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(result.ended).toBe("ended");
    expect(reconnects()).toBe(0);
  });

  it("gives up once the broadcaster stays gone from the server", async () => {
    const network = new FakeNetwork();
    const { result, reconnects } = await playing(network);
    // Relay closed without a goodbye (killed, crashed, PC off).
    network.peers.get("relay-tenno-v1-ABC234")!.destroy();
    await vi.advanceTimersByTimeAsync(0);
    expect(reconnects()).toBe(1);
    await vi.advanceTimersByTimeAsync(RECONNECT_ATTEMPT_MS);
    expect(result.ended).toBeUndefined();
    await vi.advanceTimersByTimeAsync(HOST_GONE_MS);
    expect(result.ended).toBe("ended");
  });

  it("gives up after the deadline when nothing comes back", async () => {
    const network = new FakeNetwork();
    const { result, viewerPeer } = await playing(network);
    network.offline = true;
    viewerPeer.loseSignaling();
    const viewerCall = viewerPeer.connections.find((connection) => "answered" in connection) as FakeMediaConnection;
    viewerCall.close();
    await vi.advanceTimersByTimeAsync(RECONNECT_DEADLINE_MS - RECONNECT_ATTEMPT_MS);
    expect(result.ended).toBeUndefined();
    await vi.advanceTimersByTimeAsync(RECONNECT_ATTEMPT_MS * 2);
    expect(result.ended).toBe("lost");
  });

  it("uses growing waits capped at 30 s", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(signalingBackoffMs)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });
});

describe("HostSession signaling", () => {
  it("keeps viewers through an outage and reconnects with growing waits", async () => {
    vi.useFakeTimers();
    try {
      const network = new FakeNetwork();
      const signaling: boolean[] = [];
      const viewerLists: string[][] = [];
      const host = new HostSession(stream, config(), network.factory, {
        makeCode: codes("ABC234"),
        onSignalingChange: (up) => signaling.push(up),
        onViewersChange: (ids) => viewerLists.push(ids),
      });
      const starting = host.start();
      await vi.advanceTimersByTimeAsync(0);
      await starting;
      const { result } = watch(network, "ABC234");
      await vi.advanceTimersByTimeAsync(0);
      const hostPeer = network.peers.get("relay-tenno-v1-ABC234")!;
      const reconnect = vi.spyOn(hostPeer, "reconnect");
      network.offline = true;
      hostPeer.loseSignaling();
      await vi.advanceTimersByTimeAsync(1000 + 2000);
      expect(reconnect).toHaveBeenCalledTimes(2);
      network.offline = false;
      await vi.advanceTimersByTimeAsync(4000);
      expect(signaling.at(-1)).toBe(true);
      expect(viewerLists.at(-1)).toHaveLength(1);
      expect(result.ended).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
