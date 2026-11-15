// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HostSession, loadSessionConfig, type EncoderSettings } from "@relay/core";
import { usePlatform } from "../platform/PlatformContext";
import { usePeerFactory } from "./PeerFactoryContext";

export type HostState =
  | { status: "starting" }
  | { status: "live"; code: string; viewers: string[]; maxViewers?: number; signaling: boolean }
  | { status: "failed"; reason: string };

export interface HostControls {
  /** New encoder settings for every viewer, mid-broadcast. */
  setEncoderSettings: (settings: EncoderSettings) => void;
  /** Broadcast another source under the same code (see HostSession.replaceSource). */
  replaceSource: (next: MediaStream) => Promise<void>;
}

/**
 * Runs a HostSession for as long as the component is mounted with this
 * stream. To retry after a failure, remount (change the component key).
 */
export function useHostSession(stream: MediaStream, encoder: EncoderSettings): [HostState, HostControls] {
  const platform = usePlatform();
  const createPeer = usePeerFactory();
  const [state, setState] = useState<HostState>({ status: "starting" });
  const sessionRef = useRef<HostSession | null>(null);
  // Encoder settings at the time the session starts; later changes go
  // through setEncoderSettings so they don't restart the broadcast.
  const initialEncoder = useRef(encoder);

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
        ...initialEncoder.current,
        onViewersChange: (viewers) =>
          update((current) => (current.status === "live" ? { ...current, viewers } : current)),
        onSignalingChange: (signaling) =>
          update((current) => (current.status === "live" ? { ...current, signaling } : current)),
      });
      const current = session;
      sessionRef.current = session;
      // Dev builds only: a diagnostics handle for DevTools (which packaged
      // builds don't open anyway): await relayDiagnostics.hostVideoStats()
      if (import.meta.env.DEV) {
        (globalThis as { relayDiagnostics?: object }).relayDiagnostics = {
          hostVideoStats: () => current.getVideoStats(),
        };
      }
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
      sessionRef.current = null;
      session?.stop();
    };
  }, [stream, platform, createPeer]);

  const setEncoderSettings = useCallback((settings: EncoderSettings) => {
    initialEncoder.current = { ...initialEncoder.current, ...settings };
    sessionRef.current?.setEncoderSettings(settings);
  }, []);

  const replaceSource = useCallback(async (next: MediaStream) => {
    const session = sessionRef.current;
    if (!session) throw new Error("No broadcast to switch");
    await session.replaceSource(next);
  }, []);

  const controls = useMemo(() => ({ setEncoderSettings, replaceSource }), [setEncoderSettings, replaceSource]);
  return [state, controls];
}
