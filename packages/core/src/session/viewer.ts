// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { peerIdForCode } from "../code";
import { maskCode, type LogFn } from "../log";
import type { SessionConfig } from "./config";
import { isHostMessage } from "./messages";
import type { DataConnectionLike, MediaConnectionLike, PeerError, PeerFactory, PeerLike } from "./peer";
import { sessionSdpTransform } from "./sdp";
import { sampleConnection, sampleFields, type ConnectionSample } from "./stats";

/** No stream this long after connecting usually means NAT/firewall trouble. */
export const VIEWER_STREAM_TIMEOUT_MS = 20_000;
/** How often a playing connection's health is sampled for the log. */
export const VIEWER_SAMPLE_MS = 5000;

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
  /** Diagnostics (Platform.log). */
  log?: LogFn;
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
  private sampler: ReturnType<typeof setInterval> | null = null;
  private lastSample: ConnectionSample | undefined;
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

  private log(level: "info" | "warn" | "error", message: string, data?: Record<string, string | number | boolean | undefined>) {
    this.events.log?.({ level, scope: "viewer", message, data: { code: maskCode(this.code), ...data } });
  }

  connect() {
    const hostId = peerIdForCode(this.code);
    const peer = this.createPeer(undefined, { iceServers: this.config.iceServers, server: this.config.server });
    this.peer = peer;
    this.log("info", "Connecting");
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
      if (!this.ended) this.log("warn", "Lost the signaling server");
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
      this.log("info", "Playing");
      this.watchHealth(call);
      this.events.onStream?.(stream);
    });
    call.on("close", () => this.end("ended"));
  }

  /** Samples the connection now and then, so a drop is logged with what it looked like. */
  private watchHealth(call: MediaConnectionLike) {
    const pc = call.peerConnection;
    if (!pc || this.sampler) return;
    const sample = () => {
      void pc.getStats().then(
        (report) => {
          const next = sampleConnection(report, Date.now(), this.lastSample);
          // A dead connection reports no route: keep the last one known.
          next.route ??= this.lastSample?.route;
          this.lastSample = next;
        },
        () => {},
      );
    };
    sample();
    this.sampler = setInterval(sample, VIEWER_SAMPLE_MS);
    pc.addEventListener("connectionstatechange", () => {
      const state = pc.connectionState;
      if (state === "connected") this.log("info", "Media connected", { route: this.lastSample?.route });
      else if (state === "disconnected" || state === "failed") {
        this.log("warn", "Media connection changed", { state, ...sampleFields(this.lastSample) });
      }
    });
  }

  private end(reason: ViewerEndReason) {
    if (this.ended) return;
    this.ended = true;
    this.log(reason === "left" ? "info" : "warn", "Ended", { reason, ...sampleFields(this.lastSample) });
    if (this.sampler) clearInterval(this.sampler);
    if (this.timeout) clearTimeout(this.timeout);
    this.peer?.destroy();
    this.events.onEnd?.(reason);
  }
}
