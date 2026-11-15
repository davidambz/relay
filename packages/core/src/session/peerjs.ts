// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { Peer, type PeerOptions } from "peerjs";
import type { PeerFactory, PeerLike } from "./peer";

/**
 * The production PeerFactory. Kept in its own module so the host/viewer
 * logic (and its tests) never import PeerJS, which expects a browser.
 */
export const createPeerJs: PeerFactory = (id, { iceServers, server }) => {
  const options: PeerOptions = { config: { iceServers }, debug: 1, ...server };
  const peer = id === undefined ? new Peer(options) : new Peer(id, options);
  return peer as unknown as PeerLike;
};
