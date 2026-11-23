// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

// In-memory stand-in for the PeerJS signaling server + WebRTC, for tests.
// Mirrors the PeerJS behaviours the session layer depends on: async
// "open", unavailable-id / peer-unavailable errors, connection/call
// events on the remote side, answer() delivering the caller's stream,
// and close propagating to both ends.

import type {
  DataConnectionLike,
  MediaConnectionLike,
  PeerFactory,
  PeerFactoryOptions,
  PeerLike,
} from "../peer";

type Listener = (...args: any[]) => void;

class FakeEmitter {
  private readonly listeners = new Map<string, Listener[]>();
  on(event: string, listener: Listener) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
}

const tick = (fn: () => void) => queueMicrotask(fn);

export class FakeSender {
  track: { kind: string; id?: string } | null = { kind: "video" };
  /** Tracks handed to replaceTrack, in order. */
  readonly replaced: (MediaStreamTrack | null)[] = [];
  async replaceTrack(track: MediaStreamTrack | null) {
    this.replaced.push(track);
    this.track = track;
  }
  readonly applied: number[] = [];
  readonly degradation: (RTCDegradationPreference | undefined)[] = [];
  getParameters() {
    return { encodings: [{} as RTCRtpEncodingParameters] } as RTCRtpSendParameters;
  }
  /** Most setParameters calls ever running at once (real senders reject overlaps). */
  maxConcurrent = 0;
  private inFlight = 0;
  async setParameters(parameters: RTCRtpSendParameters) {
    this.inFlight++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.inFlight);
    await new Promise((resolve) => setTimeout(resolve, 0));
    this.inFlight--;
    this.applied.push(parameters.encodings[0].maxBitrate!);
    this.degradation.push(parameters.degradationPreference);
  }
}

export class FakeDataConnection extends FakeEmitter implements DataConnectionLike {
  open = false;
  remote!: FakeDataConnection;
  readonly received: unknown[] = [];
  private closed = false;
  readonly peer: string;
  constructor(peer: string) {
    super();
    this.peer = peer;
  }
  send(data: unknown) {
    if (!this.open) throw new Error("send on a closed connection");
    const remote = this.remote;
    tick(() => {
      if (remote.open) {
        remote.received.push(data);
        remote.emit("data", data);
      }
    });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this.emit("close");
    this.remote.close();
  }
}

export class FakeMediaConnection extends FakeEmitter implements MediaConnectionLike {
  remote!: FakeMediaConnection;
  sdpTransform?: (sdp: string) => string;
  answered = false;
  readonly sender = new FakeSender();
  /** Present when the call carries sound (the host's stream had an audio track). */
  readonly audioSender: FakeSender | null;
  private readonly stateListeners = new Set<() => void>();
  private state: RTCPeerConnectionState = "new";
  /** Simulates the RTCPeerConnection moving to another connectionState. */
  setConnectionState(state: RTCPeerConnectionState) {
    this.state = state;
    for (const listener of this.stateListeners) listener();
  }
  readonly peerConnection = ((owner: FakeMediaConnection) => ({
    get connectionState(): RTCPeerConnectionState {
      return owner.state;
    },
    addEventListener: (_type: string, listener: () => void) => owner.stateListeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => owner.stateListeners.delete(listener),
    getStats: async () => new Map(),
    getSenders: () => [owner.sender, ...(owner.audioSender ? [owner.audioSender] : [])],
    getTransceivers: () => [
      { sender: owner.sender, receiver: { track: { kind: "video" } } },
      ...(owner.audioSender ? [{ sender: owner.audioSender, receiver: { track: { kind: "audio" } } }] : []),
    ],
  }))(this) as unknown as RTCPeerConnection;
  private closed = false;
  readonly peer: string;
  readonly outgoingStream?: MediaStream;
  constructor(peer: string, outgoingStream?: MediaStream) {
    super();
    this.peer = peer;
    this.outgoingStream = outgoingStream;
    const hasAudio = typeof outgoingStream?.getAudioTracks === "function" && outgoingStream.getAudioTracks().length > 0;
    this.audioSender = hasAudio ? new FakeSender() : null;
    if (this.audioSender) this.audioSender.track = { kind: "audio" };
  }
  answer(_stream?: MediaStream, options?: { sdpTransform?: (sdp: string) => string }) {
    this.answered = true;
    this.sdpTransform = options?.sdpTransform;
    const callerStream = this.remote.outgoingStream;
    tick(() => {
      if (!this.closed && callerStream) this.emit("stream", callerStream);
    });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.emit("close");
    this.remote.close();
  }
}

export class FakePeer extends FakeEmitter implements PeerLike {
  destroyed = false;
  disconnected = false;
  readonly calls: FakeMediaConnection[] = [];
  readonly connections: (FakeDataConnection | FakeMediaConnection)[] = [];
  private readonly network: FakeNetwork;
  readonly id: string;
  readonly options: PeerFactoryOptions;
  constructor(network: FakeNetwork, id: string, options: PeerFactoryOptions) {
    super();
    this.network = network;
    this.id = id;
    this.options = options;
  }
  connect(peerId: string) {
    const local = new FakeDataConnection(peerId);
    const remote = new FakeDataConnection(this.id);
    local.remote = remote;
    remote.remote = local;
    this.connections.push(local);
    tick(() => {
      const target = this.network.peers.get(peerId);
      if (!target) {
        this.emit("error", { type: "peer-unavailable", message: `Could not connect to peer ${peerId}` });
        return;
      }
      target.connections.push(remote);
      target.emit("connection", remote);
      tick(() => {
        local.open = true;
        remote.open = true;
        remote.emit("open");
        local.emit("open");
      });
    });
    return local;
  }
  call(peerId: string, stream: MediaStream, options?: { sdpTransform?: (sdp: string) => string }) {
    const local = new FakeMediaConnection(peerId, stream);
    local.sdpTransform = options?.sdpTransform;
    const remote = new FakeMediaConnection(this.id);
    local.remote = remote;
    remote.remote = local;
    this.calls.push(local);
    this.connections.push(local);
    tick(() => {
      const target = this.network.peers.get(peerId);
      if (!target) return;
      target.connections.push(remote);
      target.emit("call", remote);
    });
    return local;
  }
  /** Like PeerJS: a successful reconnect emits "open" again. */
  reconnect() {
    this.disconnected = false;
    tick(() => {
      if (!this.destroyed) this.emit("open", this.id);
    });
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const connection of this.connections) connection.close();
    if (this.network.peers.get(this.id) === this) this.network.peers.delete(this.id);
    this.emit("close");
  }
}

export class FakeNetwork {
  readonly peers = new Map<string, FakePeer>();
  readonly created: FakePeer[] = [];
  /** When set, the signaling server is unreachable. */
  offline = false;
  private nextId = 1;

  readonly factory: PeerFactory = (id, options) => {
    const peer = new FakePeer(this, id ?? `auto-${this.nextId++}`, options);
    this.created.push(peer);
    tick(() => {
      if (this.offline) {
        peer.emit("error", { type: "network", message: "Lost connection to server" });
      } else if (this.peers.has(peer.id)) {
        peer.emit("error", { type: "unavailable-id", message: `ID "${peer.id}" is taken` });
      } else {
        this.peers.set(peer.id, peer);
        peer.emit("open", peer.id);
      }
    });
    return peer;
  };

  /** Pretend someone else already holds this id on the server. */
  occupy(id: string) {
    this.peers.set(id, new FakePeer(this, id, { iceServers: [] }));
  }
}

/** A MediaStream stand-in with real track bookkeeping (add/remove/get by kind). */
export class FakeStream {
  readonly id: string;
  private tracks: MediaStreamTrack[];
  constructor(id: string, tracks: { kind: string; id: string }[]) {
    this.id = id;
    this.tracks = tracks as unknown as MediaStreamTrack[];
  }
  getTracks() {
    return [...this.tracks];
  }
  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }
  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }
  addTrack(track: MediaStreamTrack) {
    if (!this.tracks.includes(track)) this.tracks.push(track);
  }
  removeTrack(track: MediaStreamTrack) {
    this.tracks = this.tracks.filter((candidate) => candidate !== track);
  }
}
