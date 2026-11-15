// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

// Messages on the host↔viewer DataConnection (JSON serialization, so
// any shell's PeerJS build can read them). Unknown types are ignored, so
// newer builds can add messages without breaking older viewers.

export type HostMessage =
  | { type: "full"; maxViewers: number }
  | { type: "ended" };

export function isHostMessage(value: unknown): value is HostMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value.type === "full" || value.type === "ended")
  );
}
