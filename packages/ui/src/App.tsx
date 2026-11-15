// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useState } from "react";
import { Header } from "./components/Header";
import { useI18n } from "./i18n/I18nContext";
import { useSystemTheme } from "./hooks/useSystemTheme";
import { Home } from "./screens/Home";
import { Live } from "./screens/Live";
import { SourcePicker, type StartedBroadcast } from "./screens/SourcePicker";
import { Watch } from "./screens/Watch";
import styles from "./App.module.css";

type Route =
  | { screen: "home" }
  | { screen: "pick"; notice?: string }
  | { screen: "live"; broadcast: StartedBroadcast }
  | { screen: "watch" };

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

export function App() {
  useSystemTheme();
  const { t } = useI18n();
  const [route, setRoute] = useState<Route>({ screen: "home" });

  const handleSourceEnded = useCallback(() => {
    setRoute((current) => {
      if (current.screen === "live") stopStream(current.broadcast.stream);
      return { screen: "pick", notice: t.live.sourceEnded };
    });
  }, [t]);

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
            onStarted={(broadcast) => setRoute({ screen: "live", broadcast })}
          />
        )}
        {route.screen === "live" && (
          <Live
            broadcast={route.broadcast}
            onStop={() => {
              stopStream(route.broadcast.stream);
              setRoute({ screen: "pick" });
            }}
            onSourceEnded={handleSourceEnded}
          />
        )}
        {route.screen === "watch" && <Watch onBack={() => setRoute({ screen: "home" })} />}
      </main>
    </div>
  );
}
