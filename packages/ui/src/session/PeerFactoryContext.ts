// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { createContext, useContext } from "react";
import type { PeerFactory } from "@relay/core";
import { createPeerJs } from "@relay/core/peerjs";

// Which PeerJS-compatible implementation sessions use. Real PeerJS by
// default; tests provide the in-memory FakeNetwork instead.
export const PeerFactoryContext = createContext<PeerFactory>(createPeerJs);

export function usePeerFactory(): PeerFactory {
  return useContext(PeerFactoryContext);
}
