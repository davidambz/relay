// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { generateCode, peerIdForCode } from "../code";
import { applySenderSettings, maxBitrateForViewers } from "./bitrate";
import type { SessionConfig } from "./config";
import type { HostMessage } from "./messages";
import type { DataConnectionLike, MediaConnectionLike, PeerError, PeerFactory, PeerLike } from "./peer";
import { sessionSdpTransform } from "./sdp";

const MAX_CODE_ATTEMPTS = 5;
/** Time for a goodbye message to flush before its connection is torn down. */
const FLUSH_MS = 300;

export interface HostSessionEvents {
  /** Connected viewer ids, in join order. */
  onViewersChange?: (viewerIds: string[]) => void;
  /** Lost the signaling server; existing viewers keep watching meanwhile. */
  onSignalingChange?: (connected: boolean) => void;
}

export interface HostSessionOptions extends HostSessionEvents {
  /** From the chosen quality mode; see videoProfileFor. */
  degradationPreference?: RTCDegradationPreference;
  /** Injectable for tests. */
  makeCode?: () => string;
}

/** What the broadcaster's encoder is doing for one viewer (from getStats). */
export interface ViewerVideoStats {
  viewerId: string;
  codec?: string;
  encoderImplementation?: string;
  powerEfficientEncoder?: boolean;
  frameWidth?: number;
  frameHeight?: number;
  framesPerSecond?: number;
  qualityLimitationReason?: string;
}

interface Viewer {
  conn: DataConnectionLike;
  call: MediaConnectionLike;
  closed: boolean;
}

export class HostSessionError extends Error {
  readonly type: string;
  constructor(type: string, message: string) {
    super(message);
    this.name = "HostSessionError";
    this.type = type;
  }
}

/**
 * The broadcaster's side: registers a share code on the signaling server
 * and calls every viewer that connects with the captured stream.
 *
 * Flow per viewer: the viewer opens a DataConnection to us; when it opens
 * we call them with our stream (so viewers never need a dummy stream of
 * their own) and they answer receive-only.
 */
export class HostSession {
  private peer: PeerLike | null = null;
  private readonly viewers = new Map<string, Viewer>();
  private stopped = false;
  private currentCode: string | null = null;
  private readonly stream: MediaStream;
  private readonly config: SessionConfig;
  private readonly createPeer: PeerFactory;
  private readonly events: HostSessionEvents;
  private readonly makeCode: () => string;
  private readonly degradationPreference?: RTCDegradationPreference;
  private readonly sdpTransform: (sdp: string) => string;

  constructor(stream: MediaStream, config: SessionConfig, createPeer: PeerFactory, options: HostSessionOptions = {}) {
    this.stream = stream;
    this.config = config;
    this.createPeer = createPeer;
    this.events = options;
    this.makeCode = options.makeCode ?? generateCode;
    this.degradationPreference = options.degradationPreference;
    this.sdpTransform = sessionSdpTransform(config.preferredVideoCodec);
  }

  get code(): string | null {
    return this.currentCode;
  }

  /**
   * Claims a code on the signaling server and starts accepting viewers.
   * Retries with a fresh code if one is already taken. Rejects if stop()
   * is called first or the server can't be reached.
   */
  async start(): Promise<string> {
    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
      const code = this.makeCode();
      const peer = this.createPeer(peerIdForCode(code), {
        iceServers: this.config.iceServers,
        server: this.config.server,
      });
      this.peer = peer;
      const outcome = await waitForOpen(peer);
      if (this.stopped) {
        peer.destroy();
        throw new HostSessionError("stopped", "The broadcast was stopped while starting");
      }
      if (outcome === "open") {
        this.currentCode = code;
        this.listen(peer);
        return code;
      }
      peer.destroy();
      if (outcome.type !== "unavailable-id") {
        throw new HostSessionError(outcome.type, outcome.message ?? "Couldn't reach the signaling server");
      }
    }
    throw new HostSessionError("unavailable-id", "Couldn't find a free share code");
  }

  /** Ends the broadcast for everyone. Safe to call at any time, more than once. */
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const peer = this.peer;
    if (peer && this.currentCode === null) {
      // Still claiming a code: nobody to say goodbye to, tear down now so
      // start() unblocks and rejects.
      peer.destroy();
      return;
    }
    const goodbye: HostMessage = { type: "ended" };
    for (const viewer of this.viewers.values()) {
      if (viewer.conn.open) void viewer.conn.send(goodbye);
    }
    this.viewers.clear();
    this.events.onViewersChange?.([]);
    if (peer) setTimeout(() => peer.destroy(), FLUSH_MS);
  }

  private listen(peer: PeerLike) {
    peer.on("connection", (conn: DataConnectionLike) => this.acceptViewer(peer, conn));
    // Viewers never call us; refuse anything that tries.
    peer.on("call", (call: MediaConnectionLike) => call.close());
    peer.on("disconnected", () => {
      this.events.onSignalingChange?.(false);
      if (!this.stopped && !peer.destroyed) peer.reconnect();
    });
    peer.on("open", () => this.events.onSignalingChange?.(true));
    peer.on("error", (error: PeerError) => {
      // After startup, errors are about one connection or the signaling
      // link; viewers already connected keep their media either way.
      console.warn("Relay host peer error", error.type, error.message);
    });
  }

  private acceptViewer(peer: PeerLike, conn: DataConnectionLike) {
    conn.on("open", () => {
      if (this.stopped) {
        conn.close();
        return;
      }
      if (this.viewers.size >= this.config.maxViewers) {
        const full: HostMessage = { type: "full", maxViewers: this.config.maxViewers };
        void conn.send(full);
        setTimeout(() => conn.close(), FLUSH_MS);
        return;
      }
      const call = peer.call(conn.peer, this.stream, { sdpTransform: this.sdpTransform });
      const viewer: Viewer = { conn, call, closed: false };
      this.viewers.set(conn.peer, viewer);
      call.on("close", () => this.removeViewer(conn.peer));
      call.on("error", () => this.removeViewer(conn.peer));
      this.viewersChanged();
    });
    conn.on("close", () => this.removeViewer(conn.peer));
    conn.on("error", () => this.removeViewer(conn.peer));
  }

  private removeViewer(id: string) {
    const viewer = this.viewers.get(id);
    if (!viewer || viewer.closed) return;
    viewer.closed = true;
    this.viewers.delete(id);
    viewer.call.close();
    viewer.conn.close();
    this.viewersChanged();
  }

  private viewersChanged() {
    this.events.onViewersChange?.([...this.viewers.keys()]);
    const settings = {
      maxBitrate: maxBitrateForViewers(this.viewers.size),
      degradationPreference: this.degradationPreference,
    };
    for (const viewer of this.viewers.values()) {
      void applySenderSettings(() => viewer.call.peerConnection, settings, () => viewer.closed).catch((error) =>
        console.warn("Couldn't apply the encoder settings", error),
      );
    }
  }

  /** Per-viewer encoder stats, for diagnostics and a future stats readout. */
  async getVideoStats(): Promise<ViewerVideoStats[]> {
    const results: ViewerVideoStats[] = [];
    for (const [viewerId, viewer] of this.viewers) {
      const pc = viewer.call.peerConnection;
      if (!pc) continue;
      const report = await pc.getStats();
      const entry: ViewerVideoStats = { viewerId };
      report.forEach((stat: Record<string, unknown>) => {
        if (stat.type === "outbound-rtp" && stat.kind === "video") {
          Object.assign(entry, {
            encoderImplementation: stat.encoderImplementation,
            powerEfficientEncoder: stat.powerEfficientEncoder,
            frameWidth: stat.frameWidth,
            frameHeight: stat.frameHeight,
            framesPerSecond: stat.framesPerSecond,
            qualityLimitationReason: stat.qualityLimitationReason,
          });
          const codec = typeof stat.codecId === "string" ? report.get(stat.codecId) : undefined;
          if (codec && typeof codec.mimeType === "string") entry.codec = codec.mimeType;
        }
      });
      results.push(entry);
    }
    return results;
  }
}

function waitForOpen(peer: PeerLike): Promise<"open" | PeerError> {
  return new Promise((resolve) => {
    let settled = false;
    peer.on("open", () => {
      if (!settled) {
        settled = true;
        resolve("open");
      }
    });
    peer.on("error", (error: PeerError) => {
      if (!settled) {
        settled = true;
        resolve(error);
      }
    });
    // destroy() (from stop() mid-start) emits "close", not "error".
    peer.on("close", () => {
      if (!settled) {
        settled = true;
        resolve({ type: "stopped", message: "The peer was destroyed while starting" });
      }
    });
  });
}
