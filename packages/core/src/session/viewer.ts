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
/** Media "disconnected" this long counts as dropped (a blip recovers sooner). */
export const MEDIA_GRACE_MS = 5000;
/** Reconnecting gives up after this long without a picture. */
export const RECONNECT_DEADLINE_MS = 60_000;
/** Each attempt to get the picture back waits this long for it. */
export const RECONNECT_ATTEMPT_MS = 12_000;
/** The broadcaster missing from the server this long: they're gone. */
export const HOST_GONE_MS = 20_000;
/** Waits between signaling reconnects: 1 s, 2 s, 4 s... up to 30 s. */
export function signalingBackoffMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
}

export type ViewerEndReason =
  | "ended" // the broadcaster stopped
  | "full" // the broadcast hit its viewer limit
  | "not-found" // nobody is broadcasting with that code
  | "timeout" // connected to signaling but media never arrived
  | "network" // couldn't reach the signaling server
  | "lost" // the connection dropped and couldn't be brought back
  | "left"; // we called leave()

export interface ViewerSessionEvents {
  onStream?: (stream: MediaStream) => void;
  /** The picture dropped; trying to get it back (the session goes on). */
  onReconnecting?: () => void;
  onEnd?: (reason: ViewerEndReason) => void;
  /** Diagnostics (Platform.log). */
  log?: LogFn;
}

type Phase = "connecting" | "playing" | "reconnecting" | "ended";

/**
 * The viewer's side: looks a code up, opens a DataConnection to the
 * broadcaster, and answers their call receive-only.
 *
 * Once playing, only the broadcaster saying goodbye (or leave()) ends it.
 * The signaling server is only needed to set connections up, so losing
 * it just means reconnecting to it in the background, with growing waits.
 * When the picture itself drops, the session reconnects to the same code
 * by itself, and gives up only after RECONNECT_DEADLINE_MS (or sooner
 * when the server says the broadcaster is gone).
 */
export class ViewerSession {
  private peer: PeerLike | null = null;
  private conn: DataConnectionLike | null = null;
  private call: MediaConnectionLike | null = null;
  private phase: Phase = "connecting";
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private sampler: ReturnType<typeof setInterval> | null = null;
  private mediaGrace: ReturnType<typeof setTimeout> | null = null;
  private signalingTimer: ReturnType<typeof setTimeout> | null = null;
  private signalingAttempts = 0;
  private reconnectStarted = 0;
  private hostMissingSince: number | null = null;
  private lastSample: ConnectionSample | undefined;
  private readonly hostId: string;
  private readonly code: string;
  private readonly config: SessionConfig;
  private readonly createPeer: PeerFactory;
  private readonly events: ViewerSessionEvents;

  constructor(code: string, config: SessionConfig, createPeer: PeerFactory, events: ViewerSessionEvents = {}) {
    this.code = code;
    this.hostId = peerIdForCode(code);
    this.config = config;
    this.createPeer = createPeer;
    this.events = events;
  }

  private log(level: "info" | "warn" | "error", message: string, data?: Record<string, string | number | boolean | undefined>) {
    this.events.log?.({ level, scope: "viewer", message, data: { code: maskCode(this.code), ...data } });
  }

  private get ended() {
    return this.phase === "ended";
  }

  connect() {
    const peer = this.createPeer(undefined, { iceServers: this.config.iceServers, server: this.config.server });
    this.peer = peer;
    this.log("info", "Connecting");
    this.armTimeout(VIEWER_STREAM_TIMEOUT_MS, () => this.end("timeout"));

    // PeerJS emits "open" again after every successful reconnect(). The
    // DataConnection is peer to peer and survives a signaling blip, so
    // this only opens one when there's none (the first time, or while
    // reconnecting the picture).
    peer.on("open", () => {
      if (this.ended) return;
      if (this.signalingAttempts > 0) this.log("info", "Signaling server back");
      this.signalingAttempts = 0;
      if (!this.conn) this.openConnection();
    });
    peer.on("call", (call: MediaConnectionLike) => this.answer(call));
    peer.on("error", (error: PeerError) => this.onPeerError(error));
    peer.on("disconnected", () => {
      if (this.ended || peer.destroyed) return;
      // Losing signaling doesn't drop media that's already flowing.
      this.log("warn", "Lost the signaling server", { attempt: this.signalingAttempts });
      const wait = signalingBackoffMs(this.signalingAttempts++);
      if (this.signalingTimer) clearTimeout(this.signalingTimer);
      this.signalingTimer = setTimeout(() => {
        this.signalingTimer = null;
        if (!this.ended && !peer.destroyed && peer.disconnected) peer.reconnect();
      }, wait);
    });
  }

  leave() {
    this.end("left");
  }

  private onPeerError(error: PeerError) {
    if (this.ended) return;
    const signaling = error.type === "network" || error.type === "server-error" || error.type === "socket-error";
    if (this.phase === "connecting") {
      // Before the first picture these answer the person right away.
      if (error.type === "peer-unavailable") this.end("not-found");
      else if (signaling) this.end("network");
      else console.warn("Relay viewer peer error", error.type, error.message);
      return;
    }
    if (error.type === "peer-unavailable" && this.phase === "reconnecting") {
      // The broadcaster isn't on the server right now. A blip of theirs
      // clears up; staying gone means they closed Relay without a goodbye.
      const now = Date.now();
      this.hostMissingSince ??= now;
      if (now - this.hostMissingSince >= HOST_GONE_MS) this.end("ended");
      return;
    }
    // Signaling trouble while watching: "disconnected" follows and the
    // reconnect is scheduled there.
    if (!signaling) console.warn("Relay viewer peer error", error.type, error.message);
  }

  private openConnection() {
    const peer = this.peer;
    if (!peer || peer.destroyed || peer.disconnected) return;
    const conn = peer.connect(this.hostId, { serialization: "json", reliable: true });
    this.conn = conn;
    conn.on("data", (data: unknown) => {
      if (conn !== this.conn || !isHostMessage(data)) return;
      // Only an explicit goodbye ends the session from here.
      this.end(data.type === "full" ? "full" : "ended");
    });
    conn.on("close", () => {
      if (conn === this.conn) this.dropped("data connection closed");
    });
  }

  private answer(call: MediaConnectionLike) {
    // A new call replaces the current one (it answers our latest
    // connection, e.g. while reconnecting).
    if (this.ended || call.peer !== this.hostId) {
      call.close();
      return;
    }
    this.call?.close();
    this.call = call;
    call.answer(undefined, { sdpTransform: sessionSdpTransform(this.config.preferredVideoCodec) });
    call.on("stream", (stream: MediaStream) => {
      if (this.ended || call !== this.call) return;
      this.clearTimeout();
      const recovered = this.phase === "reconnecting";
      this.phase = "playing";
      this.hostMissingSince = null;
      this.log("info", recovered ? "Playing again" : "Playing", recovered ? { afterMs: Date.now() - this.reconnectStarted } : undefined);
      this.watchHealth(call);
      this.events.onStream?.(stream);
    });
    call.on("close", () => {
      if (call === this.call) this.dropped("call closed");
    });
  }

  /** Samples the connection now and then, and notices when it drops. */
  private watchHealth(call: MediaConnectionLike) {
    const pc = call.peerConnection;
    if (!pc) return;
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
    if (this.sampler) clearInterval(this.sampler);
    this.sampler = setInterval(sample, VIEWER_SAMPLE_MS);
    const onState = () => {
      if (call !== this.call || this.ended) return;
      const state = pc.connectionState;
      if (state === "connected") {
        if (this.mediaGrace) this.log("info", "Media back", { route: this.lastSample?.route });
        this.clearMediaGrace();
      } else if (state === "failed" || state === "closed") {
        this.dropped(`media ${state}`);
      } else if (state === "disconnected" && !this.mediaGrace) {
        this.log("warn", "Media connection changed", { state, ...sampleFields(this.lastSample) });
        this.mediaGrace = setTimeout(() => this.dropped("media disconnected"), MEDIA_GRACE_MS);
      }
    };
    pc.addEventListener("connectionstatechange", onState);
  }

  /** The picture is gone without a goodbye: get it back. */
  private dropped(why: string) {
    if (this.ended || this.phase === "reconnecting") return;
    if (this.phase === "connecting") {
      // Never played: the connection was refused or broke while setting up.
      this.end("ended");
      return;
    }
    this.log("warn", "Dropped, reconnecting", { why, ...sampleFields(this.lastSample) });
    this.phase = "reconnecting";
    this.reconnectStarted = Date.now();
    this.hostMissingSince = null;
    this.events.onReconnecting?.();
    this.retry();
  }

  private retry() {
    if (this.ended || this.phase !== "reconnecting") return;
    if (Date.now() - this.reconnectStarted >= RECONNECT_DEADLINE_MS) {
      this.end("lost");
      return;
    }
    this.teardownConnection();
    // With signaling up, connect now; otherwise "open" does it once it's back.
    this.openConnection();
    this.armTimeout(RECONNECT_ATTEMPT_MS, () => this.retry());
  }

  private teardownConnection() {
    this.clearMediaGrace();
    if (this.sampler) clearInterval(this.sampler);
    this.sampler = null;
    const { conn, call } = this;
    this.conn = null;
    this.call = null;
    call?.close();
    conn?.close();
  }

  private armTimeout(ms: number, then: () => void) {
    this.clearTimeout();
    this.timeout = setTimeout(() => {
      this.timeout = null;
      then();
    }, ms);
  }

  private clearTimeout() {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
  }

  private clearMediaGrace() {
    if (this.mediaGrace) clearTimeout(this.mediaGrace);
    this.mediaGrace = null;
  }

  private end(reason: ViewerEndReason) {
    if (this.ended) return;
    this.phase = "ended";
    this.log(reason === "left" ? "info" : "warn", "Ended", { reason, ...sampleFields(this.lastSample) });
    this.clearTimeout();
    if (this.signalingTimer) clearTimeout(this.signalingTimer);
    this.teardownConnection();
    this.peer?.destroy();
    this.events.onEnd?.(reason);
  }
}
