// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "react";
import { Button } from "./components/Button";
import { Dialog } from "./components/Dialog";
import { Header } from "./components/Header";
import { useI18n } from "./i18n/I18nContext";
import { usePlatform } from "./platform/PlatformContext";
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
  const platform = usePlatform();
  const session = route.screen === "live" ? "broadcasting" : route.screen === "viewing" ? "watching" : null;

  // Lets the shell hold back update restarts, light its tray, and so on.
  useEffect(() => {
    platform.setSession?.(session);
  }, [platform, session]);

  // Desktop: quitting mid-broadcast (e.g. from the tray) asks here first.
  const [quitPrompt, setQuitPrompt] = useState<((confirmed: boolean) => void) | null>(null);
  useEffect(
    () =>
      platform.onQuitRequest?.(
        () =>
          new Promise<boolean>((resolve) => {
            setQuitPrompt(() => (confirmed: boolean) => {
              setQuitPrompt(null);
              resolve(confirmed);
            });
          }),
      ),
    [platform],
  );

  // Android: the whole app is the PiP window; only the video should show.
  const [pictureInPicture, setPictureInPicture] = useState(false);
  useEffect(() => platform.onPictureInPictureChange?.(setPictureInPicture), [platform]);

  // Android back: leave fullscreen first, then step back through the
  // screens; at home, leave the app. A live broadcast isn't ended by
  // back (only by Stop).
  useEffect(() => {
    if (!platform.onBackButton) return;
    return platform.onBackButton(() => {
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
        return true;
      }
      let handled = true;
      setRoute((current) => {
        if (current.screen === "viewing") return { screen: "watch" };
        if (current.screen === "watch" || current.screen === "pick") return { screen: "home" };
        handled = false;
        return current;
      });
      return handled;
    });
  }, [platform]);

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
      {!(pictureInPicture && route.screen === "viewing") && (
        <Header status={route.screen === "live" ? "live" : route.screen === "viewing" ? "watching" : "idle"} />
      )}
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
            pictureInPicture={pictureInPicture}
            onLeave={() => setRoute({ screen: "watch" })}
            onEnded={handleViewerEnded}
          />
        )}
      </main>
      {quitPrompt && (
        <Dialog
          title={t.quitWhileLive.title}
          onClose={() => quitPrompt(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => quitPrompt(false)}>
                {t.quitWhileLive.cancel}
              </Button>
              <Button variant="danger" onClick={() => quitPrompt(true)}>
                {t.quitWhileLive.confirm}
              </Button>
            </>
          }
        >
          <p className={styles.quitMessage}>{t.quitWhileLive.message}</p>
          <p className={styles.quitDetail}>{t.quitWhileLive.detail}</p>
        </Dialog>
      )}
    </div>
  );
}
