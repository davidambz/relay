// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { HostSession, loadSessionConfig, type EncoderSettings } from "@relay/core";
import { usePlatform } from "../platform/PlatformContext";
import { usePeerFactory } from "./PeerFactoryContext";

export type HostState =
  | { status: "off" }
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
 * Runs a HostSession while there's a stream to broadcast, for as long as
 * the component stays mounted. A new `attempt` starts a fresh session
 * (the retry after a failure).
 */
export function useHostSession(
  stream: MediaStream | null,
  encoder: EncoderSettings,
  attempt = 0,
): [HostState, HostControls] {
  const platform = usePlatform();
  const createPeer = usePeerFactory();
  const [state, setState] = useState<HostState>({ status: stream ? "starting" : "off" });
  // A new stream or attempt starts over from "starting" (or "off"),
  // adjusted during render rather than in the effect.
  const [startedFor, setStartedFor] = useState({ stream, attempt });
  if (startedFor.stream !== stream || startedFor.attempt !== attempt) {
    setStartedFor({ stream, attempt });
    setState({ status: stream ? "starting" : "off" });
  }
  const sessionRef = useRef<HostSession | null>(null);
  // The latest encoder settings, read when a session starts (a new stream
  // or a retry). Changes mid-broadcast go through setEncoderSettings, so
  // they don't restart it.
  const latestEncoder = useRef(encoder);
  useLayoutEffect(() => {
    latestEncoder.current = encoder;
  });

  useEffect(() => {
    if (!stream) return;
    let disposed = false;
    let session: HostSession | null = null;
    const update = (next: (current: HostState) => HostState) => {
      if (!disposed) setState(next);
    };

    void (async () => {
      const config = await loadSessionConfig(platform.storage);
      if (disposed) return;
      session = new HostSession(stream, config, createPeer, {
        ...latestEncoder.current,
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

    // Quitting the app doesn't unmount React; end the broadcast explicitly
    // so viewers get the "ended" goodbye right away.
    const stopOnUnload = () => session?.stop();
    window.addEventListener("pagehide", stopOnUnload);

    return () => {
      disposed = true;
      window.removeEventListener("pagehide", stopOnUnload);
      sessionRef.current = null;
      session?.stop();
    };
  }, [stream, attempt, platform, createPeer]);

  const setEncoderSettings = useCallback((settings: EncoderSettings) => {
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
