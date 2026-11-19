// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { ViewerEndReason } from "@relay/core";
import { Button } from "./components/Button";
import { Dialog } from "./components/Dialog";
import { Header } from "./components/Header";
import { BroadcastSettingsDialog } from "./dialogs/BroadcastSettingsDialog";
import { GoLiveDialog } from "./dialogs/GoLiveDialog";
import { WatchDialog } from "./dialogs/WatchDialog";
import { useI18n } from "./i18n/I18nContext";
import { usePlatform } from "./platform/PlatformContext";
import { useSystemTheme } from "./hooks/useSystemTheme";
import { useStreamQuality } from "./hooks/useStreamQuality";
import { useVolumes } from "./player/useVolume";
import { Home } from "./screens/Home";
import { useBroadcast, type StartedBroadcast } from "./session/useBroadcast";
import { useViewerSessions } from "./session/useViewerSessions";
import { Stage } from "./stage/Stage";
import type { Strings } from "./i18n/strings";
import { canGoBack, deriveView, initialNav, navReducer, type Notice } from "./navigation";
import styles from "./App.module.css";

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

function endReasonText(reason: Exclude<ViewerEndReason, "left">, t: Strings): string {
  return {
    ended: t.watch.ended,
    full: t.watch.full,
    "not-found": t.watch.notFound,
    timeout: t.watch.timeout,
    network: t.watch.network,
  }[reason];
}

function noticeText(notice: Notice | undefined, t: Strings): string | undefined {
  if (!notice) return undefined;
  switch (notice.kind) {
    case "source-ended":
      return t.stage.sourceEnded;
    case "viewer-ended":
      return t.stage.viewerEnded(notice.code, endReasonText(notice.reason, t));
    default: {
      const unhandled: never = notice;
      return unhandled;
    }
  }
}

/** A dialog over the home screen or the stage. */
type OpenDialog =
  | { kind: "go-live" }
  | { kind: "switch-source" }
  | { kind: "settings" }
  /** `pending`: the code just submitted, while it connects. */
  | { kind: "watch"; pending?: string; error?: string };

export function App() {
  useSystemTheme();
  const { t } = useI18n();
  // Sessions and the tile in focus: see navigation.ts for the rules.
  const [nav, dispatch] = useReducer(navReducer<StartedBroadcast>, undefined, initialNav<StartedBroadcast>);
  const view = deriveView(nav);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  // Read by the Android back handler, which is registered once.
  const navRef = useRef(nav);
  const dialogRef = useRef(dialog);
  useLayoutEffect(() => {
    navRef.current = nav;
    dialogRef.current = dialog;
  }, [nav, dialog]);
  const [, rememberQuality] = useStreamQuality();
  const platform = usePlatform();
  const volumeFor = useVolumes();

  const handleSourceEnded = useCallback(() => dispatch({ type: "source-ended" }), []);
  const [broadcast, broadcastActions] = useBroadcast(nav.onAir, {
    onSourceEnded: handleSourceEnded,
    onQualityChange: rememberQuality,
  });
  const handleViewerEnded = useCallback(
    (code: string, reason: ViewerEndReason) => dispatch({ type: "viewer-ended", code, reason }),
    [],
  );
  const [viewers, viewerSessions] = useViewerSessions(nav.watching, handleViewerEnded);

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

  // Android back: close a dialog, leave fullscreen, then leave the watched
  // broadcast in focus; otherwise, leave the app. A live broadcast isn't
  // ended by back (only by Stop).
  useEffect(() => {
    if (!platform.onBackButton) return;
    return platform.onBackButton(() => {
      if (dialogRef.current) {
        setDialog(null);
        return true;
      }
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
        return true;
      }
      if (!canGoBack(navRef.current)) return false;
      dispatch({ type: "back" });
      return true;
    });
  }, [platform]);

  // The capture stops when its broadcast ends, however it ends (stop,
  // shared window closed, app closing); a retry keeps the same stream.
  const liveStream = nav.onAir?.broadcast.stream ?? null;
  useEffect(() => {
    if (!liveStream) return;
    return () => stopStream(liveStream);
  }, [liveStream]);

  // The watch dialog waits for the code it submitted: closes once it
  // plays, or shows why it couldn't (instead of a note on the stage).
  const pendingCode = dialog?.kind === "watch" ? dialog.pending : undefined;
  const pendingState = pendingCode ? viewers[pendingCode] : undefined;
  if (pendingCode && pendingState?.status === "playing") setDialog(null);
  if (pendingCode && nav.notice?.kind === "viewer-ended" && nav.notice.code === pendingCode) {
    setDialog({ kind: "watch", error: endReasonText(nav.notice.reason, t) });
    dispatch({ type: "dismiss-notice" });
  }

  const ownCode = broadcast?.host.status === "live" ? broadcast.host.code : undefined;
  const notice = noticeText(nav.notice, t);
  const canHost = platform.capabilities.host;
  const closeDialog = () => setDialog(null);

  return (
    <div className={styles.app}>
      {viewerSessions}
      {!(pictureInPicture && view.screen === "stage") && <Header status={view.status} />}
      <main className={styles.main} data-screen={view.screen}>
        {view.screen === "home" ? (
          <Home
            notice={notice}
            onBroadcast={() => setDialog({ kind: "go-live" })}
            onWatch={() => setDialog({ kind: "watch" })}
          />
        ) : (
          <Stage
            tiles={view.tiles}
            focus={nav.focus}
            broadcast={broadcast}
            viewers={viewers}
            volumeFor={volumeFor}
            notice={notice}
            onDismissNotice={() => dispatch({ type: "dismiss-notice" })}
            onFocus={(tile) => dispatch({ type: "focus", tile })}
            onLeave={(code) => dispatch({ type: "left", code })}
            onStop={() => dispatch({ type: "stopped" })}
            onRetry={() => dispatch({ type: "retry" })}
            onAddWatch={() => setDialog({ kind: "watch" })}
            onGoLive={canHost ? () => setDialog({ kind: "go-live" }) : undefined}
            onSwitchSource={() => setDialog({ kind: "switch-source" })}
            onSettings={() => setDialog({ kind: "settings" })}
            onAudioChange={broadcastActions.setAudioOn}
            pictureInPicture={pictureInPicture}
            active={dialog === null && quitPrompt === null}
          />
        )}
      </main>

      {dialog?.kind === "go-live" && (
        <GoLiveDialog
          onClose={closeDialog}
          onStarted={(started) => {
            setDialog(null);
            dispatch({ type: "started", broadcast: started });
          }}
        />
      )}
      {dialog?.kind === "switch-source" && broadcast && (
        <GoLiveDialog
          mode="switch"
          audio={broadcast.hasAudio}
          onClose={closeDialog}
          onStarted={(next) => {
            void broadcastActions.switchSource(next).then(() => setDialog(null));
          }}
        />
      )}
      {dialog?.kind === "settings" && broadcast && (
        <BroadcastSettingsDialog
          broadcast={broadcast}
          onClose={closeDialog}
          onQualityChange={(quality) => void broadcastActions.changeQuality(quality)}
          onAudioChange={broadcastActions.setAudioOn}
        />
      )}
      {dialog?.kind === "watch" && (
        <WatchDialog
          ownCode={ownCode}
          connecting={pendingCode !== undefined}
          error={dialog.error}
          onClose={closeDialog}
          onWatch={(code) => {
            setDialog({ kind: "watch", pending: code });
            dispatch({ type: "watch", code });
          }}
        />
      )}

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
