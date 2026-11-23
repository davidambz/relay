// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { generateCode, peerIdForCode } from "../code";
import { maskCode, type LogFn } from "../log";
import { applySenderSettings, maxBitrateForViewers, type SenderSettings } from "./bitrate";
import type { SessionConfig } from "./config";
import type { HostMessage } from "./messages";
import type { DataConnectionLike, MediaConnectionLike, PeerError, PeerFactory, PeerLike } from "./peer";
import { sessionSdpTransform } from "./sdp";

const MAX_CODE_ATTEMPTS = 5;
/**
 * A viewer whose connection stays "disconnected" this long is gone (app
 * closed, phone killed it, network lost). Chromium may never move such a
 * connection on to "failed", and PeerJS only drops a call on "failed".
 */
export const VIEWER_DISCONNECT_GRACE_MS = 8000;
const PC_POLL_MS = 200;
const PC_POLL_TIMEOUT_MS = 15_000;
/** Time for a goodbye message to flush before its connection is torn down. */
const FLUSH_MS = 300;

export interface HostSessionEvents {
  /** Connected viewer ids, in join order. */
  onViewersChange?: (viewerIds: string[]) => void;
  /** Lost the signaling server; existing viewers keep watching meanwhile. */
  onSignalingChange?: (connected: boolean) => void;
  /** Diagnostics (Platform.log). */
  log?: LogFn;
}

export interface EncoderSettings {
  degradationPreference?: RTCDegradationPreference;
  /** Multiplier on the per-viewer bitrate cap (see videoProfileFor). */
  bitrateScale?: number;
}

export interface HostSessionOptions extends HostSessionEvents, EncoderSettings {
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
  id: string;
  conn: DataConnectionLike;
  call: MediaConnectionLike;
  closed: boolean;
  /** An encoder update is in flight for this viewer. */
  applying: boolean;
  /** The newest settings that arrived while one was in flight. */
  queued: SenderSettings | null;
  /** Undoes the connection-state watch (see watchHealth). */
  unwatch?: () => void;
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
  private encoder: EncoderSettings;
  private readonly sdpTransform: (sdp: string) => string;

  constructor(stream: MediaStream, config: SessionConfig, createPeer: PeerFactory, options: HostSessionOptions = {}) {
    this.stream = stream;
    this.config = config;
    this.createPeer = createPeer;
    this.events = options;
    this.makeCode = options.makeCode ?? generateCode;
    this.encoder = { degradationPreference: options.degradationPreference, bitrateScale: options.bitrateScale };
    this.sdpTransform = sessionSdpTransform(config.preferredVideoCodec);
  }

  private log(level: "info" | "warn" | "error", message: string, data?: Record<string, string | number | boolean | undefined>) {
    const code = this.currentCode ? maskCode(this.currentCode) : undefined;
    this.events.log?.({ level, scope: "host", message, data: { code, ...data } });
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
        this.log("info", "On air", { attempts: attempt });
        this.listen(peer);
        return code;
      }
      peer.destroy();
      if (outcome.type !== "unavailable-id") {
        this.log("error", "Couldn't start", { error: outcome.type });
        throw new HostSessionError(outcome.type, outcome.message ?? "Couldn't reach the signaling server");
      }
    }
    throw new HostSessionError("unavailable-id", "Couldn't find a free share code");
  }

  /** Ends the broadcast for everyone. Safe to call at any time, more than once. */
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.log("info", "Stopped", { viewers: this.viewers.size });
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
      this.log("warn", "Lost the signaling server");
      this.events.onSignalingChange?.(false);
      if (!this.stopped && !peer.destroyed) peer.reconnect();
    });
    peer.on("open", () => {
      this.log("info", "Signaling server back");
      this.events.onSignalingChange?.(true);
    });
    peer.on("error", (error: PeerError) => {
      // After startup, errors are about one connection or the signaling
      // link; viewers already connected keep their media either way.
      console.warn("Relay host peer error", error.type, error.message);
      this.log("warn", "Peer error", { error: error.type });
    });
  }

  private acceptViewer(peer: PeerLike, conn: DataConnectionLike) {
    let viewer: Viewer | null = null;
    conn.on("open", () => {
      if (this.stopped) {
        conn.close();
        return;
      }
      // The same viewer connecting again (e.g. a reconnect from an older
      // build) replaces its previous entry; otherwise the old call would
      // keep encoding and uploading without being counted or closed.
      const previous = this.viewers.get(conn.peer);
      if (previous) this.removeViewer(previous, false, "replaced");
      const { maxViewers } = this.config;
      if (maxViewers !== undefined && this.viewers.size >= maxViewers) {
        const full: HostMessage = { type: "full", maxViewers };
        void conn.send(full);
        setTimeout(() => conn.close(), FLUSH_MS);
        if (previous) this.viewersChanged();
        return;
      }
      const call = peer.call(conn.peer, this.stream, { sdpTransform: this.sdpTransform });
      const current: Viewer = { id: conn.peer, conn, call, closed: false, applying: false, queued: null };
      viewer = current;
      this.viewers.set(conn.peer, current);
      call.on("close", () => this.removeViewer(current));
      call.on("error", () => this.removeViewer(current, true, "call-error"));
      this.watchHealth(current);
      this.log("info", "Viewer joined", { viewers: this.viewers.size });
      this.viewersChanged();
    });
    conn.on("close", () => viewer && this.removeViewer(viewer));
    conn.on("error", () => viewer && this.removeViewer(viewer));
  }

  /**
   * Tears one viewer entry down. Keyed by the entry, not the peer id, so
   * late events from a replaced connection can't remove its successor.
   */
  private removeViewer(viewer: Viewer, notify = true, reason = "closed") {
    if (viewer.closed) return;
    viewer.closed = true;
    viewer.unwatch?.();
    if (this.viewers.get(viewer.id) === viewer) this.viewers.delete(viewer.id);
    const expected = reason === "closed" || reason === "replaced";
    this.log(expected ? "info" : "warn", "Viewer left", { reason, viewers: this.viewers.size });
    viewer.call.close();
    viewer.conn.close();
    if (notify) this.viewersChanged();
  }

  /**
   * Switches what's being broadcast (another monitor or window) without
   * ending it: same code, and every viewer keeps its connection.
   *
   * The new tracks go onto each viewer's existing senders with
   * replaceTrack, so nothing renegotiates. The broadcast's stream object
   * itself is updated in place, so viewers who join later get the new
   * tracks too. A kind the broadcast never had a sender for (sound, when
   * it started without any) can't be added this way and is left out;
   * a kind the new source lacks is replaced with nothing (silence).
   *
   * The caller stops the old tracks afterwards.
   */
  async replaceSource(next: MediaStream): Promise<void> {
    const video = next.getVideoTracks()[0] ?? null;
    const audio = next.getAudioTracks()[0] ?? null;
    const hadAudio = this.stream.getAudioTracks().length > 0;
    for (const track of this.stream.getTracks()) this.stream.removeTrack(track);
    if (video) this.stream.addTrack(video);
    if (audio && hadAudio) this.stream.addTrack(audio);

    const replacements: Promise<void>[] = [];
    for (const viewer of this.viewers.values()) {
      const pc = viewer.call.peerConnection;
      if (!pc) continue; // not negotiated yet: it will pick up this.stream
      for (const transceiver of pc.getTransceivers()) {
        const kind = transceiver.receiver.track?.kind;
        const track = kind === "video" ? video : kind === "audio" ? audio : undefined;
        if (track === undefined) continue;
        replacements.push(
          transceiver.sender
            .replaceTrack(track)
            .catch((error) => console.warn("Couldn't switch a viewer to the new source", error)),
        );
      }
    }
    await Promise.all(replacements);
    // A new track starts without the encoder settings' context; reapply.
    this.applyEncoderSettings();
  }

  /**
   * Drops a viewer whose media connection dies without a goodbye: at once
   * on "failed"/"closed", or after a grace period of "disconnected" (a
   * brief network hiccup recovers on its own and keeps the seat). This is
   * what removes viewers who simply closed the app, including older
   * builds that never say goodbye.
   */
  private watchHealth(viewer: Viewer) {
    let pc: RTCPeerConnection | null = null;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    const clearGrace = () => {
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = null;
    };
    const onStateChange = () => {
      const state = pc?.connectionState;
      if (state === "failed" || state === "closed") {
        this.removeViewer(viewer, true, `media-${state}`);
      } else if (state === "disconnected") {
        if (!graceTimer) graceTimer = setTimeout(() => this.removeViewer(viewer, true, "media-disconnected"), VIEWER_DISCONNECT_GRACE_MS);
      } else {
        clearGrace();
      }
    };
    // PeerJS creates the RTCPeerConnection a moment after peer.call().
    const deadline = Date.now() + PC_POLL_TIMEOUT_MS;
    const poll = setInterval(() => {
      const candidate = viewer.call.peerConnection;
      if (candidate || viewer.closed || Date.now() > deadline) clearInterval(poll);
      if (!candidate || viewer.closed) return;
      pc = candidate;
      pc.addEventListener("connectionstatechange", onStateChange);
      onStateChange();
    }, PC_POLL_MS);
    viewer.unwatch = () => {
      clearInterval(poll);
      clearGrace();
      pc?.removeEventListener("connectionstatechange", onStateChange);
    };
  }

  /** Changes encoder settings for every viewer mid-broadcast (no renegotiation). */
  setEncoderSettings(settings: EncoderSettings) {
    this.encoder = { ...this.encoder, ...settings };
    this.applyEncoderSettings();
  }

  private viewersChanged() {
    this.events.onViewersChange?.([...this.viewers.keys()]);
    this.applyEncoderSettings();
  }

  private applyEncoderSettings() {
    const settings: SenderSettings = {
      maxBitrate: Math.round(maxBitrateForViewers(this.viewers.size) * (this.encoder.bitrateScale ?? 1)),
      degradationPreference: this.encoder.degradationPreference,
    };
    for (const viewer of this.viewers.values()) void this.applyToViewer(viewer, settings);
  }

  /**
   * One setParameters at a time per sender: overlapping calls (viewers
   * joining close together) can fail on stale parameters and leave an
   * older value in place. While one runs, only the newest settings wait.
   */
  private async applyToViewer(viewer: Viewer, settings: SenderSettings) {
    if (viewer.applying) {
      viewer.queued = settings;
      return;
    }
    viewer.applying = true;
    let next: SenderSettings | null = settings;
    while (next && !viewer.closed) {
      const current: SenderSettings = next;
      viewer.queued = null;
      try {
        await applySenderSettings(() => viewer.call.peerConnection, current, () => viewer.closed);
      } catch (error) {
        console.warn("Couldn't apply the encoder settings", error);
      }
      next = viewer.queued;
    }
    viewer.applying = false;
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
