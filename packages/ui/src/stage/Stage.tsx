// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import {
  AddWatchIcon,
  BroadcastIcon,
  CloseIcon,
  CopyIcon,
  ExitFullscreenIcon,
  FullscreenIcon,
  LeaveIcon,
  MiniPlayerIcon,
  MutedIcon,
  StripIcon,
  SlidersIcon,
  StopBroadcastIcon,
  SwitchSourceIcon,
  VolumeIcon,
  WatchIcon,
} from "../components/icons";
import { useI18n } from "../i18n/I18nContext";
import { SELF } from "../navigation";
import { usePlatform } from "../platform/PlatformContext";
import { FloatingPlayer } from "../player/FloatingPlayer";
import { actionForKey, isTypingTarget } from "../player/shortcuts";
import { useAutoHide } from "../player/useAutoHide";
import { useChildWindow } from "../player/useChildWindow";
import { useFullscreen } from "../player/useFullscreen";
import { canSetVolume, type VolumeControls } from "../player/useVolume";
import type { Broadcast } from "../session/useBroadcast";
import type { ViewerState } from "../session/useViewerSession";
import { Tile } from "./Tile";
import styles from "./Stage.module.css";

interface StageProps {
  /** Every tile: SELF for the person's own broadcast, else a watched code. */
  tiles: string[];
  focus: string | null;
  broadcast: Broadcast | null;
  viewers: Record<string, ViewerState>;
  volumeFor: (code: string) => VolumeControls;
  notice?: string;
  onDismissNotice: () => void;
  onFocus: (tile: string) => void;
  onLeave: (code: string) => void;
  onStop: () => void;
  onRetry: () => void;
  onAddWatch: () => void;
  /** Absent where the platform can't broadcast. */
  onGoLive?: () => void;
  onSwitchSource: () => void;
  onSettings: () => void;
  onAudioChange: (on: boolean) => void;
  /** The whole app is in the system's Picture-in-Picture window (Android). */
  pictureInPicture?: boolean;
  /** False while a dialog is up: the keyboard shortcuts rest. */
  active?: boolean;
}

interface BarButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  tone?: "danger";
  pressed?: boolean;
}

function BarButton({ label, onClick, children, tone, pressed }: BarButtonProps) {
  return (
    <button
      type="button"
      className={styles.control}
      data-tone={tone}
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
    >
      {children}
    </button>
  );
}

const STRIP_HIDDEN_KEY = "stage.stripHidden";

/** Whether the strip of the other broadcasts is tucked away, remembered across sessions. */
function useStripHidden(): [boolean, (hidden: boolean) => void] {
  const { storage } = usePlatform();
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void storage.get<boolean>(STRIP_HIDDEN_KEY).then((stored) => {
      if (!cancelled && typeof stored === "boolean") setHidden(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);
  const set = useCallback(
    (next: boolean) => {
      setHidden(next);
      void storage.set(STRIP_HIDDEN_KEY, next);
    },
    [storage],
  );
  return [hidden, set];
}

/**
 * Everything running, on one stage: the tile in focus big, the others in a
 * strip below it (click one to bring it up), the person's own broadcast
 * among them, and one control bar for all of it.
 */
export function Stage({
  tiles,
  focus,
  broadcast,
  viewers,
  volumeFor,
  notice,
  onDismissNotice,
  onFocus,
  onLeave,
  onStop,
  onRetry,
  onAddWatch,
  onGoLive,
  onSwitchSource,
  onSettings,
  onAudioChange,
  pictureInPicture = false,
  active = true,
}: StageProps) {
  const { t } = useI18n();
  const platform = usePlatform();
  const stageRef = useRef<HTMLDivElement>(null);
  const focusVideoRef = useRef<HTMLVideoElement>(null);
  const chrome = useAutoHide();
  const fullscreen = useFullscreen(stageRef);
  const volumeSupported = useMemo(() => canSetVolume(), []);
  const [copied, setCopied] = useState(false);
  const [stripHidden, setStripHidden] = useStripHidden();

  const watchedFocus = focus !== null && focus !== SELF ? focus : null;
  const focusAudio = watchedFocus ? volumeFor(watchedFocus) : null;
  const toggleFocusMuted = focusAudio?.toggleMuted;

  // The desktop mini player: one watched broadcast in its own window.
  const [floatingCode, setFloatingCode] = useState<string | null>(null);
  const closeFloating = useCallback(() => setFloatingCode(null), []);
  const floatingContainer = useChildWindow(floatingCode !== null, closeFloating);
  // Its broadcast went away (left or ended): close it.
  if (floatingCode !== null && !tiles.includes(floatingCode)) setFloatingCode(null);
  const floatingState = floatingCode ? viewers[floatingCode] : undefined;

  const host = broadcast?.host;
  const live = host?.status === "live" ? host : null;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyCode() {
    if (!live) return;
    try {
      await platform.copyText(live.code);
      setCopied(true);
    } catch (error) {
      console.error("Failed to copy the code", error);
    }
  }

  // Back from the system's PiP window: bring the controls back right away.
  const wasPictureInPicture = useRef(pictureInPicture);
  useEffect(() => {
    if (wasPictureInPicture.current && !pictureInPicture) chrome.show();
    wasPictureInPicture.current = pictureInPicture;
  }, [pictureInPicture, chrome]);

  // Phones: fullscreen also means no system bars and landscape.
  const { setImmersive } = platform;
  useEffect(() => {
    if (!setImmersive || !fullscreen.isFullscreen) return;
    void setImmersive(true).catch((error) => console.warn("Couldn't go immersive", error));
    return () => void setImmersive(false).catch(() => {});
  }, [setImmersive, fullscreen.isFullscreen]);

  const floatingMode = platform.capabilities.floating;
  const canFloat =
    watchedFocus !== null &&
    (floatingMode === "window" ||
      (floatingMode === "pip" &&
        (platform.enterPictureInPicture !== undefined ||
          (typeof document !== "undefined" && document.pictureInPictureEnabled === true))));

  const openFloating = useCallback(() => {
    if (!canFloat || !watchedFocus) return;
    if (floatingMode === "window") {
      setFloatingCode(watchedFocus);
      return;
    }
    // Phones and browsers: the system's own Picture-in-Picture, natively
    // where the shell provides it (Android), else the web API.
    const request = platform.enterPictureInPicture
      ? platform.enterPictureInPicture()
      : focusVideoRef.current?.requestPictureInPicture();
    void request?.catch((error) => console.warn("PiP failed", error));
  }, [canFloat, watchedFocus, floatingMode, platform]);

  // Shortcuts, on whatever is in focus; never while typing.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTypingTarget(event.target)) return;
      const action = actionForKey(event);
      if (action === "fullscreen") void fullscreen.toggle();
      else if (action === "mute" && toggleFocusMuted) toggleFocusMuted();
      else if (action === "floating" && canFloat) openFloating();
      else return;
      event.preventDefault();
      chrome.show();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, fullscreen, toggleFocusMuted, chrome, canFloat, openFloating]);

  function onStagePointer(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    chrome.show();
  }

  function onStagePointerUp(event: PointerEvent<HTMLDivElement>) {
    // Touch has no hover: a tap on the big picture toggles the controls.
    if (event.pointerType === "touch" && event.target === focusVideoRef.current) chrome.toggle();
  }

  function tileFor(tile: string, variant: "focus" | "thumb") {
    const isFocus = variant === "focus";
    if (tile === SELF) {
      if (!broadcast) return null;
      return (
        <Tile
          key={SELF}
          variant={variant}
          stream={broadcast.stream}
          streamVersion={broadcast.sourceVersion}
          name={t.stage.yourTile(broadcast.sourceName)}
          icon={<BroadcastIcon />}
          live={live !== null}
          fps={broadcast.quality.fps}
          silent
          onSelect={() => onFocus(SELF)}
          onDoubleClick={isFocus ? () => void fullscreen.toggle() : undefined}
          videoRef={isFocus ? focusVideoRef : undefined}
        />
      );
    }
    const state = viewers[tile] ?? { status: "connecting" };
    const inMini = floatingCode === tile && floatingContainer !== null;
    const audio = volumeFor(tile);
    return (
      <Tile
        key={tile}
        variant={variant}
        stream={state.status === "playing" && !inMini ? state.stream : null}
        name={tile}
        icon={<WatchIcon />}
        live={state.status === "playing"}
        volume={audio.volume}
        muted={audio.muted}
        placeholder={inMini ? t.stage.inMiniPlayer : t.viewing.connecting(tile)}
        onSelect={() => onFocus(tile)}
        onDoubleClick={isFocus ? () => void fullscreen.toggle() : undefined}
        videoRef={isFocus ? focusVideoRef : undefined}
      />
    );
  }

  const others = tiles.filter((tile) => tile !== focus);
  const level = focusAudio ? (focusAudio.muted ? 0 : focusAudio.volume) : 0;

  return (
    <div
      ref={stageRef}
      className={styles.stage}
      data-chrome={chrome.visible ? "shown" : "hidden"}
      data-fullscreen={fullscreen.isFullscreen || undefined}
      data-pip={pictureInPicture || undefined}
      onPointerMove={onStagePointer}
      onPointerDown={onStagePointer}
      onPointerUp={onStagePointerUp}
    >
      {(broadcast || notice) && (
        <div className={styles.top}>
          {broadcast && (
            <div className={styles.onAir}>
              <span className="label">{t.stage.codeLabel}</span>
              <span className={styles.visor} data-pending={!live}>
                <output className={styles.code} aria-live="polite" aria-busy={!live}>
                  {live ? live.code : t.stage.codePending}
                </output>
              </span>
              <button type="button" onClick={() => void copyCode()} disabled={!live} className={styles.copy}>
                <CopyIcon /> {copied ? t.stage.copied : t.stage.copy}
              </button>
              <span className={styles.viewers}>
                <span className="label">{t.stage.viewersLabel}</span>
                <span className={[styles.readout, "tabularNums"].join(" ")}>
                  {live ? t.stage.viewersCount(live.viewers.length, live.maxViewers) : "–"}
                </span>
                {live && live.viewers.length > 0 && (
                  // One lit lamp per connected viewer.
                  <span className={styles.lamps} aria-hidden>
                    {live.viewers.map((id) => (
                      <span key={id} className="lamp" data-lit />
                    ))}
                  </span>
                )}
              </span>
            </div>
          )}
          <div className={styles.notes}>
            {host?.status === "failed" && (
              <p className={styles.error} role="alert">
                {t.stage.startFailed}
                <button type="button" className={styles.noteAction} onClick={onRetry}>
                  {t.stage.retry}
                </button>
              </p>
            )}
            {live && !live.signaling && (
              <p className={styles.note} role="status">
                {t.stage.reconnecting}
              </p>
            )}
            {broadcast?.switchError && (
              <p className={styles.error} role="alert">
                {t.stage.switchFailed}
              </p>
            )}
            {notice && (
              <p className={styles.note} role="status">
                {notice}
                <button
                  type="button"
                  className={styles.noteDismiss}
                  onClick={onDismissNotice}
                  aria-label={t.stage.dismiss}
                  title={t.stage.dismiss}
                >
                  <CloseIcon />
                </button>
              </p>
            )}
          </div>
        </div>
      )}

      <div className={styles.focus}>{focus !== null && tileFor(focus, "focus")}</div>

      <div className={styles.dock}>
        {others.length > 0 && !stripHidden && (
          <div className={styles.strip} role="group" aria-label={t.stage.tilesLabel}>
            {others.map((tile) => tileFor(tile, "thumb"))}
          </div>
        )}

        <div
          className={styles.bar}
          role="toolbar"
          aria-label={t.stage.controlsLabel}
          onPointerEnter={(event) => event.pointerType !== "touch" && chrome.setPinned(true)}
          onPointerLeave={() => chrome.setPinned(false)}
          onFocus={() => chrome.setPinned(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) chrome.setPinned(false);
          }}
        >
          <span className={styles.barStart} />
          <div className={styles.barCenter}>
            <BarButton label={t.stage.addWatch} onClick={onAddWatch}>
              <AddWatchIcon />
            </BarButton>
            {broadcast ? (
              <>
                <BarButton label={t.stage.switchSource} onClick={onSwitchSource}>
                  <SwitchSourceIcon />
                </BarButton>
                <BarButton label={t.stage.settings} onClick={onSettings}>
                  <SlidersIcon />
                </BarButton>
                {broadcast.hasAudio && (
                  <BarButton
                    label={broadcast.audioOn ? t.stage.soundOn : t.stage.soundOff}
                    onClick={() => onAudioChange(!broadcast.audioOn)}
                    pressed={!broadcast.audioOn}
                  >
                    {broadcast.audioOn ? <VolumeIcon /> : <MutedIcon />}
                  </BarButton>
                )}
                <BarButton label={t.stage.stop} onClick={onStop} tone="danger">
                  <StopBroadcastIcon />
                </BarButton>
              </>
            ) : (
              onGoLive && (
                <BarButton label={t.stage.goLive} onClick={onGoLive}>
                  <BroadcastIcon />
                </BarButton>
              )
            )}
          </div>
          <div className={styles.barEnd}>
            {watchedFocus && (
              <>
                <BarButton label={t.stage.leave} onClick={() => onLeave(watchedFocus)}>
                  <LeaveIcon />
                </BarButton>
                <span className={styles.barDivider} aria-hidden />
              </>
            )}
            {focusAudio && (
              <>
                <BarButton
                  label={focusAudio.muted ? t.viewing.unmute : t.viewing.mute}
                  onClick={focusAudio.toggleMuted}
                  pressed={focusAudio.muted}
                >
                  {focusAudio.muted || focusAudio.volume === 0 ? <MutedIcon /> : <VolumeIcon />}
                </BarButton>
                {volumeSupported && (
                  <input
                    type="range"
                    className={styles.volume}
                    min={0}
                    max={1}
                    step={0.05}
                    value={level}
                    onChange={(event) => focusAudio.setVolume(Number(event.target.value))}
                    aria-label={t.viewing.volume}
                    style={{ "--fill": `${level * 100}%` } as CSSProperties}
                  />
                )}
              </>
            )}
            {others.length > 0 && (
              <BarButton
                label={stripHidden ? t.stage.showStrip(others.length) : t.stage.hideStrip}
                onClick={() => setStripHidden(!stripHidden)}
                pressed={stripHidden}
              >
                <StripIcon />
                {stripHidden && <span className={styles.hiddenCount}>{others.length}</span>}
              </BarButton>
            )}
            {canFloat && (
              <BarButton label={t.viewing.miniPlayer} onClick={openFloating}>
                <MiniPlayerIcon />
              </BarButton>
            )}
            <BarButton
              label={fullscreen.isFullscreen ? t.viewing.exitFullscreen : t.viewing.fullscreen}
              onClick={() => void fullscreen.toggle()}
            >
              {fullscreen.isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
            </BarButton>
          </div>
        </div>
      </div>

      {floatingContainer && floatingCode && (
        <FloatingPlayer
          container={floatingContainer}
          stream={floatingState?.status === "playing" ? floatingState.stream : null}
          audio={volumeFor(floatingCode)}
          onReturn={closeFloating}
        />
      )}
    </div>
  );
}
