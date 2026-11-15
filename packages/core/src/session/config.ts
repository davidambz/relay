// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { KeyValueStore } from "../platform";
import type { PeerServerOptions } from "./peer";

export interface SessionConfig {
  iceServers: RTCIceServer[];
  /** Custom PeerJS signaling server; undefined uses the free PeerJS cloud. */
  server?: PeerServerOptions;
  maxViewers: number;
}

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  iceServers: DEFAULT_ICE_SERVERS,
  maxViewers: 5,
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
  }
  return config;
}
