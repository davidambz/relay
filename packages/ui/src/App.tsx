// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useState } from "react";
import { Header } from "./components/Header";
import { useI18n } from "./i18n/I18nContext";
import { useSystemTheme } from "./hooks/useSystemTheme";
import { useStreamQuality } from "./hooks/useStreamQuality";
import { Home } from "./screens/Home";
import { Live } from "./screens/Live";
import { SourcePicker, type StartedBroadcast } from "./screens/SourcePicker";
import { Viewing } from "./screens/Viewing";
import { Watch } from "./screens/Watch";
import type { ViewerEndReason } from "@relay/core";
import styles from "./App.module.css";

type Route =
  | { screen: "home" }
  | { screen: "pick"; notice?: string }
  | { screen: "live"; broadcast: StartedBroadcast; attempt: number }
  | { screen: "watch"; notice?: string }
  | { screen: "viewing"; code: string };

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

export function App() {
  useSystemTheme();
  const { t } = useI18n();
  const [route, setRoute] = useState<Route>({ screen: "home" });
  const [, rememberQuality] = useStreamQuality();

  const handleSourceEnded = useCallback(() => {
    setRoute((current) => {
      if (current.screen === "live") stopStream(current.broadcast.stream);
      return { screen: "pick", notice: t.live.sourceEnded };
    });
  }, [t]);

  const handleViewerEnded = useCallback(
    (reason: ViewerEndReason) => {
      const notices: Record<ViewerEndReason, string | undefined> = {
        ended: t.watch.ended,
        full: t.watch.full,
        "not-found": t.watch.notFound,
        timeout: t.watch.timeout,
        network: t.watch.network,
        left: undefined,
      };
      setRoute({ screen: "watch", notice: notices[reason] });
    },
    [t],
  );

  return (
    <div className={styles.app}>
      <Header live={route.screen === "live"} />
      <main className={styles.main}>
        {route.screen === "home" && (
          <Home onBroadcast={() => setRoute({ screen: "pick" })} onWatch={() => setRoute({ screen: "watch" })} />
        )}
        {route.screen === "pick" && (
          <SourcePicker
            notice={route.notice}
            onBack={() => setRoute({ screen: "home" })}
            onStarted={(broadcast) => setRoute({ screen: "live", broadcast, attempt: 0 })}
          />
        )}
        {route.screen === "live" && (
          <Live
            // A new key remounts Live, which starts a fresh host session.
            key={route.attempt}
            broadcast={route.broadcast}
            onStop={() => {
              stopStream(route.broadcast.stream);
              setRoute({ screen: "pick" });
            }}
            onSourceEnded={handleSourceEnded}
            onRetry={() => setRoute({ ...route, attempt: route.attempt + 1 })}
            onQualityChange={rememberQuality}
          />
        )}
        {route.screen === "watch" && (
          <Watch
            notice={route.notice}
            onBack={() => setRoute({ screen: "home" })}
            onWatch={(code) => setRoute({ screen: "viewing", code })}
          />
        )}
        {route.screen === "viewing" && (
          <Viewing
            code={route.code}
            onLeave={() => setRoute({ screen: "watch" })}
            onEnded={handleViewerEnded}
          />
        )}
      </main>
    </div>
  );
}
