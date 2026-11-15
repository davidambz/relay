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
  readonly track = { kind: "video" };
  readonly applied: number[] = [];
  readonly degradation: (RTCDegradationPreference | undefined)[] = [];
  getParameters() {
    return { encodings: [{} as RTCRtpEncodingParameters] } as RTCRtpSendParameters;
  }
  async setParameters(parameters: RTCRtpSendParameters) {
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
  readonly peerConnection = { getSenders: () => [this.sender] } as unknown as RTCPeerConnection;
  private closed = false;
  readonly peer: string;
  readonly outgoingStream?: MediaStream;
  constructor(peer: string, outgoingStream?: MediaStream) {
    super();
    this.peer = peer;
    this.outgoingStream = outgoingStream;
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
