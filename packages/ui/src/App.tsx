// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
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
import { canGoBack, deriveView, initialNav, navReducer, type Notice, type Screen } from "./navigation";
import styles from "./App.module.css";

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

export function App() {
  useSystemTheme();
  const { t } = useI18n();
  // Screens and sessions: see navigation.ts for the rules.
  const [nav, dispatch] = useReducer(navReducer<StartedBroadcast>, undefined, initialNav<StartedBroadcast>);
  const view = deriveView(nav);
  const { screen, onAir, watching } = nav;
  // Read by the Android back handler, which is registered once.
  const navRef = useRef(nav);
  useLayoutEffect(() => {
    navRef.current = nav;
  }, [nav]);
  /** The broadcast's share code once it's up, so Watch can refuse it. */
  const [liveCode, setLiveCode] = useState<string | null>(null);
  const [, rememberQuality] = useStreamQuality();
  const platform = usePlatform();
  const onPlayer = screen === "viewing";

  // Lets the shell hold back update restarts, light its tray, and so on.
  useEffect(() => {
    platform.setSession?.(view.session);
  }, [platform, view.session]);

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
      if (!canGoBack(navRef.current)) return false;
      dispatch({ type: "back" });
      return true;
    });
  }, [platform]);

  const go = useCallback((target: Screen) => dispatch({ type: "go", screen: target }), []);

  const handleSourceEnded = useCallback(() => {
    if (onAir) stopStream(onAir.broadcast.stream);
    dispatch({ type: "source-ended" });
  }, [onAir]);

  const handleViewerEnded = useCallback((reason: ViewerEndReason) => dispatch({ type: "viewer-ended", reason }), []);

  function noticeText(notice: Notice | undefined): string | undefined {
    if (!notice) return undefined;
    if (notice.kind === "source-ended") return t.live.sourceEnded;
    if (notice.kind === "watched-ended") return t.live.watchedEnded;
    const viewerNotices: Record<typeof notice.reason, string> = {
      ended: t.watch.ended,
      full: t.watch.full,
      "not-found": t.watch.notFound,
      timeout: t.watch.timeout,
      network: t.watch.network,
    };
    return viewerNotices[notice.reason];
  }
  const notice = noticeText(view.notice);

  return (
    <div className={styles.app}>
      {!(pictureInPicture && onPlayer) && (
        <Header
          status={view.status}
          view={
            view.headerView && {
              current: view.headerView,
              onChange: (next) => go(next === "live" ? "live" : "viewing"),
            }
          }
          onReturnToLive={view.returnToLive ? () => go("live") : undefined}
        />
      )}
      <main className={styles.main}>
        {screen === "home" && <Home live={onAir !== null} onBroadcast={() => go("pick")} onWatch={() => go("watch")} />}
        {screen === "pick" && (
          <SourcePicker
            notice={notice}
            onBack={() => go("home")}
            onStarted={(broadcast) => dispatch({ type: "started", broadcast })}
          />
        )}
        {onAir && (
          // Hidden, not unmounted, on other screens: unmounting ends the broadcast.
          <div hidden={screen !== "live"} className={styles.sessionHolder}>
            <Live
              // A new key remounts Live, which starts a fresh host session.
              key={onAir.attempt}
              broadcast={onAir.broadcast}
              onStop={() => {
                stopStream(onAir.broadcast.stream);
                dispatch({ type: "stopped" });
              }}
              onWatch={view.canWatchFromLive ? () => go("watch") : undefined}
              onSourceEnded={handleSourceEnded}
              onRetry={() => dispatch({ type: "retry" })}
              onQualityChange={rememberQuality}
              onCode={setLiveCode}
              notice={screen === "live" ? notice : undefined}
              active={screen === "live"}
            />
          </div>
        )}
        {screen === "watch" && (
          <Watch
            notice={notice}
            onBack={() => go("home")}
            ownCode={onAir ? (liveCode ?? undefined) : undefined}
            onWatch={(code) => dispatch({ type: "watch", code })}
          />
        )}
        {watching !== null && (
          // Hidden, not unmounted, on the broadcast's screen: it keeps playing.
          <div hidden={!onPlayer} className={styles.sessionHolder}>
            <Viewing
              key={watching}
              code={watching}
              active={onPlayer}
              pictureInPicture={pictureInPicture}
              onLeave={() => dispatch({ type: "left" })}
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
