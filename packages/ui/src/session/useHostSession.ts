// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState } from "react";
import { HostSession, loadSessionConfig } from "@relay/core";
import { usePlatform } from "../platform/PlatformContext";
import { usePeerFactory } from "./PeerFactoryContext";

export type HostState =
  | { status: "starting" }
  | { status: "live"; code: string; viewers: string[]; maxViewers: number; signaling: boolean }
  | { status: "failed"; reason: string };

/**
 * Runs a HostSession for as long as the component is mounted with this
 * stream. To retry after a failure, remount (change the component key).
 */
export function useHostSession(stream: MediaStream): HostState {
  const platform = usePlatform();
  const createPeer = usePeerFactory();
  const [state, setState] = useState<HostState>({ status: "starting" });

  useEffect(() => {
    let disposed = false;
    let session: HostSession | null = null;
    const update = (next: (current: HostState) => HostState) => {
      if (!disposed) setState(next);
    };

    void (async () => {
      const config = await loadSessionConfig(platform.storage);
      if (disposed) return;
      session = new HostSession(stream, config, createPeer, {
        onViewersChange: (viewers) =>
          update((current) => (current.status === "live" ? { ...current, viewers } : current)),
        onSignalingChange: (signaling) =>
          update((current) => (current.status === "live" ? { ...current, signaling } : current)),
      });
      try {
        const code = await session.start();
        update(() => ({ status: "live", code, viewers: [], maxViewers: config.maxViewers, signaling: true }));
      } catch (error) {
        if (disposed) return;
        console.error("Couldn't start the broadcast", error);
        update(() => ({ status: "failed", reason: (error as { type?: string }).type ?? "unknown" }));
      }
    })();

    return () => {
      disposed = true;
      session?.stop();
    };
  }, [stream, platform, createPeer]);

  return state;
}
