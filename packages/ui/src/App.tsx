// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  | { screen: "live" }
  | { screen: "watch"; notice?: string }
  | { screen: "viewing" };

/**
 * The broadcast and the broadcast being watched live beside the route,
 * not in it: someone on air can watch another broadcast (desktop) and
 * switch between the two screens, each kept mounted (hidden when the
 * other is on screen) so neither session ends.
 */
interface OnAir {
  broadcast: StartedBroadcast;
  /** Bumped to start a fresh host session after a failure. */
  attempt: number;
}

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

export function App() {
  useSystemTheme();
  const { t } = useI18n();
  const [route, setRoute] = useState<Route>({ screen: "home" });
  const [onAir, setOnAir] = useState<OnAir | null>(null);
  /** The code being watched, if any. */
  const [watchingCode, setWatchingCode] = useState<string | null>(null);
  // Read by the Android back handler, which is registered once.
  const routeRef = useRef(route);
  useLayoutEffect(() => {
    routeRef.current = route;
  }, [route]);
  /** The broadcast's share code once it's up, so Watch can refuse it. */
  const [liveCode, setLiveCode] = useState<string | null>(null);
  /** Why the watched broadcast went away while the broadcast's screen was up. */
  const [liveNotice, setLiveNotice] = useState<string>();
  const [, rememberQuality] = useStreamQuality();
  const platform = usePlatform();
  const watching = watchingCode !== null;
  const onPlayer = route.screen === "viewing";
  // Broadcasting outranks watching: the shell asks before quitting it.
  const session = onAir ? "broadcasting" : watching ? "watching" : null;

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
      const current = routeRef.current.screen;
      if (current === "viewing") {
        setWatchingCode(null);
        setRoute({ screen: "watch" });
        return true;
      }
      if (current === "watch" || current === "pick") {
        setRoute({ screen: "home" });
        return true;
      }
      return false;
    });
  }, [platform]);

  const handleSourceEnded = useCallback(() => {
    setOnAir((current) => {
      if (current) stopStream(current.broadcast.stream);
      return null;
    });
    setLiveNotice(undefined);
    // Watching something meanwhile? Don't pull the person out of it.
    setRoute((current) =>
      current.screen === "live" || current.screen === "watch" ? { screen: "pick", notice: t.live.sourceEnded } : current,
    );
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
      setWatchingCode(null);
      // On their own broadcast's screen meanwhile? Leave them there, and say why.
      if (routeRef.current.screen === "viewing") setRoute({ screen: "watch", notice: notices[reason] });
      else if (reason !== "left") setLiveNotice(t.live.watchedEnded);
    },
    [t],
  );

  return (
    <div className={styles.app}>
      {!(pictureInPicture && onPlayer) && (
        <Header
          status={onAir ? (watching ? "live-watching" : "live") : watching ? "watching" : "idle"}
          view={
            onAir && watching && (route.screen === "live" || onPlayer)
              ? {
                  current: onPlayer ? "watching" : "live",
                  onChange: (view) => setRoute({ screen: view === "live" ? "live" : "viewing" }),
                }
              : undefined
          }
          onReturnToLive={onAir && !watching && route.screen !== "live" ? () => setRoute({ screen: "live" }) : undefined}
        />
      )}
      <main className={styles.main}>
        {route.screen === "home" && (
          <Home
            live={onAir !== null}
            onBroadcast={() => setRoute({ screen: onAir ? "live" : "pick" })}
            onWatch={() => setRoute({ screen: "watch" })}
          />
        )}
        {route.screen === "pick" && (
          <SourcePicker
            notice={route.notice}
            onBack={() => setRoute({ screen: "home" })}
            onStarted={(broadcast) => {
              setOnAir({ broadcast, attempt: 0 });
              setRoute({ screen: "live" });
            }}
          />
        )}
        {onAir && (
          // Hidden, not unmounted, on other screens: unmounting ends the broadcast.
          <div hidden={route.screen !== "live"} className={styles.sessionHolder}>
            <Live
              // A new key remounts Live, which starts a fresh host session.
              key={onAir.attempt}
              broadcast={onAir.broadcast}
              onStop={() => {
                stopStream(onAir.broadcast.stream);
                setOnAir(null);
                setLiveNotice(undefined);
                setRoute({ screen: "pick" });
              }}
              // Already watching one: the header switches between the two.
              onWatch={watching ? undefined : () => setRoute({ screen: "watch" })}
              onSourceEnded={handleSourceEnded}
              onRetry={() => setOnAir({ ...onAir, attempt: onAir.attempt + 1 })}
              onQualityChange={rememberQuality}
              onCode={setLiveCode}
              notice={liveNotice}
              active={route.screen === "live"}
            />
          </div>
        )}
        {route.screen === "watch" && (
          <Watch
            notice={route.notice}
            onBack={() => setRoute({ screen: "home" })}
            ownCode={onAir ? (liveCode ?? undefined) : undefined}
            onWatch={(code) => {
              setLiveNotice(undefined);
              setWatchingCode(code);
              setRoute({ screen: "viewing" });
            }}
          />
        )}
        {watchingCode !== null && (
          // Hidden, not unmounted, on the broadcast's screen: it keeps playing.
          <div hidden={!onPlayer} className={styles.sessionHolder}>
            <Viewing
              key={watchingCode}
              code={watchingCode}
              active={onPlayer}
              pictureInPicture={pictureInPicture}
              onLeave={() => {
                setWatchingCode(null);
                setRoute({ screen: "watch" });
              }}
              onEnded={handleViewerEnded}
            />
          </div>
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
