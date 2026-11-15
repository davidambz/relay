// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { peerIdForCode } from "../code";
import type { SessionConfig } from "./config";
import { isHostMessage } from "./messages";
import type { DataConnectionLike, MediaConnectionLike, PeerError, PeerFactory, PeerLike } from "./peer";
import { sessionSdpTransform } from "./sdp";

/** No stream this long after connecting usually means NAT/firewall trouble. */
export const VIEWER_STREAM_TIMEOUT_MS = 20_000;

export type ViewerEndReason =
  | "ended" // the broadcaster stopped or went away
  | "full" // the broadcast hit its viewer limit
  | "not-found" // nobody is broadcasting with that code
  | "timeout" // connected to signaling but media never arrived
  | "network" // couldn't reach the signaling server
  | "left"; // we called leave()

export interface ViewerSessionEvents {
  onStream?: (stream: MediaStream) => void;
  onEnd?: (reason: ViewerEndReason) => void;
}

/**
 * The viewer's side: looks a code up, opens a DataConnection to the
 * broadcaster, and answers their call receive-only.
 */
export class ViewerSession {
  private peer: PeerLike | null = null;
  private conn: DataConnectionLike | null = null;
  private ended = false;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private readonly code: string;
  private readonly config: SessionConfig;
  private readonly createPeer: PeerFactory;
  private readonly events: ViewerSessionEvents;

  constructor(code: string, config: SessionConfig, createPeer: PeerFactory, events: ViewerSessionEvents = {}) {
    this.code = code;
    this.config = config;
    this.createPeer = createPeer;
    this.events = events;
  }

  connect() {
    const hostId = peerIdForCode(this.code);
    const peer = this.createPeer(undefined, { iceServers: this.config.iceServers, server: this.config.server });
    this.peer = peer;
    this.timeout = setTimeout(() => this.end("timeout"), VIEWER_STREAM_TIMEOUT_MS);

    // PeerJS emits "open" again after every successful reconnect(); the
    // DataConnection is peer to peer and survives the signaling blip, so
    // only the first one connects (a second would make the host call us
    // twice).
    peer.on("open", () => {
      if (this.ended || this.conn) return;
      this.conn = peer.connect(hostId, { serialization: "json", reliable: true });
      this.watchConnection(this.conn);
    });
    peer.on("call", (call: MediaConnectionLike) => this.answer(call, hostId));
    peer.on("error", (error: PeerError) => {
      if (error.type === "peer-unavailable") this.end("not-found");
      else if (error.type === "network" || error.type === "server-error" || error.type === "socket-error") {
        this.end("network");
      } else console.warn("Relay viewer peer error", error.type, error.message);
    });
    peer.on("disconnected", () => {
      // Losing signaling doesn't drop media that's already flowing.
      if (!this.ended && !peer.destroyed) peer.reconnect();
    });
  }

  leave() {
    this.end("left");
  }

  private watchConnection(conn: DataConnectionLike) {
    conn.on("data", (data: unknown) => {
      if (!isHostMessage(data)) return;
      this.end(data.type === "full" ? "full" : "ended");
    });
    conn.on("close", () => this.end("ended"));
  }

  private answer(call: MediaConnectionLike, hostId: string) {
    if (this.ended || call.peer !== hostId) {
      call.close();
      return;
    }
    call.answer(undefined, { sdpTransform: sessionSdpTransform(this.config.preferredVideoCodec) });
    call.on("stream", (stream: MediaStream) => {
      if (this.ended) return;
      if (this.timeout) clearTimeout(this.timeout);
      this.timeout = null;
      this.events.onStream?.(stream);
    });
    call.on("close", () => this.end("ended"));
  }

  private end(reason: ViewerEndReason) {
    if (this.ended) return;
    this.ended = true;
    if (this.timeout) clearTimeout(this.timeout);
    this.peer?.destroy();
    this.events.onEnd?.(reason);
  }
}
