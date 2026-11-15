// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

// The slice of PeerJS the session layer uses, as structural interfaces.
// The real PeerJS classes satisfy them (see peerjs.ts), and tests swap in
// in-memory fakes, so host/viewer logic runs without WebRTC or a network.

export interface Emitter {
  on(event: string, listener: (...args: any[]) => void): unknown;
}

export interface PeerError {
  type: string;
  message?: string;
}

export interface DataConnectionLike extends Emitter {
  /** Remote peer id. */
  readonly peer: string;
  readonly open: boolean;
  send(data: unknown): void | Promise<void>;
  close(): void;
}

export interface MediaConnectionLike extends Emitter {
  readonly peer: string;
  readonly peerConnection?: RTCPeerConnection | null;
  answer(stream?: MediaStream, options?: { sdpTransform?: (sdp: string) => string }): void;
  close(): void;
}

export interface PeerLike extends Emitter {
  readonly id: string;
  readonly destroyed: boolean;
  readonly disconnected: boolean;
  connect(peer: string, options?: { serialization?: string; reliable?: boolean }): DataConnectionLike;
  call(peer: string, stream: MediaStream, options?: { sdpTransform?: (sdp: string) => string }): MediaConnectionLike;
  reconnect(): void;
  destroy(): void;
}

export interface PeerServerOptions {
  host: string;
  port?: number;
  path?: string;
  secure?: boolean;
  key?: string;
}

export interface PeerFactoryOptions {
  iceServers: RTCIceServer[];
  server?: PeerServerOptions;
}

/** Creates a peer; `id` undefined means "let the server assign one". */
export type PeerFactory = (id: string | undefined, options: PeerFactoryOptions) => PeerLike;
