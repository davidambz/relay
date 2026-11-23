// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState } from "react";
import { loadSessionConfig, ViewerSession, type ViewerEndReason } from "@relay/core";
import { usePlatform } from "../platform/PlatformContext";
import { usePeerFactory } from "./PeerFactoryContext";

export type ViewerState =
  | { status: "connecting" }
  | { status: "playing"; stream: MediaStream }
  /** The picture dropped; the session is getting it back by itself. */
  | { status: "reconnecting" }
  | { status: "ended"; reason: ViewerEndReason };

/** Connects to a broadcast while mounted; leaving (unmount) disconnects. */
export function useViewerSession(code: string): ViewerState {
  const platform = usePlatform();
  const createPeer = usePeerFactory();
  const [state, setState] = useState<ViewerState>({ status: "connecting" });

  useEffect(() => {
    let disposed = false;
    let session: ViewerSession | null = null;

    void loadSessionConfig(platform.storage).then((config) => {
      if (disposed) return;
      session = new ViewerSession(code, config, createPeer, {
        onStream: (stream) => {
          if (!disposed) setState({ status: "playing", stream });
        },
        onReconnecting: () => {
          if (!disposed) setState({ status: "reconnecting" });
        },
        onEnd: (reason) => {
          if (!disposed) setState({ status: "ended", reason });
        },
        log: platform.log,
      });
      session.connect();
    });

    // Closing the window doesn't unmount React; leave explicitly so the
    // broadcaster's viewer count drops right away.
    const leaveOnUnload = () => session?.leave();
    window.addEventListener("pagehide", leaveOnUnload);

    return () => {
      disposed = true;
      window.removeEventListener("pagehide", leaveOnUnload);
      session?.leave();
    };
  }, [code, platform, createPeer]);

  return state;
}
