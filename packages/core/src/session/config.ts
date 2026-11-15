// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { KeyValueStore } from "../platform";
import type { PeerServerOptions } from "./peer";

export interface SessionConfig {
  iceServers: RTCIceServer[];
  /** Custom PeerJS signaling server; undefined uses the free PeerJS cloud. */
  server?: PeerServerOptions;
  maxViewers: number;
  /**
   * Video codec to put first in negotiation (e.g. "H264"), or undefined
   * for the browser's default order.
   */
  preferredVideoCodec?: string;
}

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  iceServers: DEFAULT_ICE_SERVERS,
  maxViewers: 5,
  // Measured on Windows with an NVIDIA GPU while gaming, Smoothness mode:
  // Chromium's default VP8 ran in software (libvpx) at 13 fps; H.264 used
  // the hardware encoder (Media Foundation / NVENC) at 29 fps. Peers
  // without H.264 still negotiate whatever they share; this only orders.
  preferredVideoCodec: "H264",
};

export const SESSION_CONFIG_KEY = "session";

/**
 * Reads overrides from storage (key "session") on top of the defaults, so
 * TURN servers or a self-hosted peerjs-server can be added by editing the
 * settings file, without a new build. Malformed values fall back to the
 * default for that field rather than breaking every connection.
 */
export async function loadSessionConfig(storage: KeyValueStore): Promise<SessionConfig> {
  let stored: Partial<SessionConfig> | undefined;
  try {
    stored = await storage.get<Partial<SessionConfig>>(SESSION_CONFIG_KEY);
  } catch {
    stored = undefined;
  }
  const config = { ...DEFAULT_SESSION_CONFIG };
  if (stored && typeof stored === "object") {
    if (Array.isArray(stored.iceServers) && stored.iceServers.length > 0) config.iceServers = stored.iceServers;
    if (stored.server && typeof stored.server.host === "string") config.server = stored.server;
    if (Number.isInteger(stored.maxViewers) && (stored.maxViewers as number) > 0) {
      config.maxViewers = stored.maxViewers as number;
    }
    if (typeof stored.preferredVideoCodec === "string") config.preferredVideoCodec = stored.preferredVideoCodec;
    // An explicit null in storage means "browser default", overriding ours.
    if ((stored as { preferredVideoCodec?: unknown }).preferredVideoCodec === null) delete config.preferredVideoCodec;
  }
  return config;
}
