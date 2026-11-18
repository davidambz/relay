// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useMemo, useRef, type PointerEvent } from "react";
import { BackIcon, ExitFullscreenIcon, FullscreenIcon, MiniPlayerIcon, MutedIcon, VolumeIcon } from "../components/icons";
import { useI18n } from "../i18n/I18nContext";
import { usePlatform } from "../platform/PlatformContext";
import { actionForKey, isTypingTarget } from "./shortcuts";
import { useAutoHide } from "./useAutoHide";
import { useFullscreen } from "./useFullscreen";
import { canSetVolume, type VolumeControls } from "./useVolume";
import styles from "./Player.module.css";

interface PlayerProps {
  stream: MediaStream | null;
  code: string;
  /** Shown centered on the stage while there's no stream yet. */
  placeholder?: string;
  /** Shared with the mini player, so both always agree. */
  audio: VolumeControls;
  onLeave: () => void;
  /** Open the shell's mini-player window (capabilities.floating === "window"). */
  onFloatingWindow?: () => void;
  /**
   * The whole app is in the system's Picture-in-Picture window (Android):
   * show only the picture, no badge or controls.
   */
  pictureInPicture?: boolean;
  /** False while another screen is on top (the player keeps playing, hidden). */
  active?: boolean;
}

export function Player({ stream, code, placeholder, audio, onLeave, onFloatingWindow, pictureInPicture = false, active = true }: PlayerProps) {
  const { t } = useI18n();
  const platform = usePlatform();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const chrome = useAutoHide();
  const fullscreen = useFullscreen(containerRef);
  const { volume, muted, setVolume, toggleMuted } = audio;
  const volumeSupported = useMemo(() => canSetVolume(), []);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
  }, [volume, muted]);

  // Coming back from the system's PiP window: bring the controls back
  // right away (they were hidden there, and the countdown ran out).
  const wasPictureInPicture = useRef(pictureInPicture);
  useEffect(() => {
    if (wasPictureInPicture.current && !pictureInPicture) chrome.show();
    wasPictureInPicture.current = pictureInPicture;
  }, [pictureInPicture, chrome]);

  // Back on screen after another one was on top: show the controls again
  // (their countdown ran out while hidden).
  const wasActive = useRef(active);
  useEffect(() => {
    if (!wasActive.current && active) chrome.show();
    wasActive.current = active;
  }, [active, chrome]);

  // Phones: fullscreen also means no system bars and landscape. Leaving
  // fullscreen (or the player) puts both back.
  const { setImmersive } = platform;
  useEffect(() => {
    if (!setImmersive || !fullscreen.isFullscreen) return;
    void setImmersive(true).catch((error) => console.warn("Couldn't go immersive", error));
    return () => void setImmersive(false).catch(() => {});
  }, [setImmersive, fullscreen.isFullscreen]);

  const floatingMode = platform.capabilities.floating;
  const canFloat =
    (floatingMode === "window" && onFloatingWindow !== undefined) ||
    (floatingMode === "pip" &&
      (platform.enterPictureInPicture !== undefined ||
        (typeof document !== "undefined" && document.pictureInPictureEnabled === true)));

  const openFloating = useCallback(() => {
    if (!canFloat) return;
    if (floatingMode === "window") {
      onFloatingWindow?.();
      return;
    }
    // Phones and browsers: the system's own Picture-in-Picture, natively
    // where the shell provides it (Android), else the web API.
    const request = platform.enterPictureInPicture
      ? platform.enterPictureInPicture()
      : videoRef.current?.requestPictureInPicture();
    void request?.catch((error) => console.warn("PiP failed", error));
  }, [canFloat, floatingMode, onFloatingWindow, platform]);

  // Shortcuts: global while the player is on screen, except when typing.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTypingTarget(event.target)) return;
      const action = actionForKey(event);
      if (!action) return;
      if (action === "fullscreen") void fullscreen.toggle();
      else if (action === "mute") toggleMuted();
      else if (action === "floating" && canFloat) openFloating();
      else return;
      event.preventDefault();
      chrome.show();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, fullscreen, toggleMuted, chrome, canFloat, openFloating]);

  function onStagePointer(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    chrome.show();
  }

  function onStagePointerUp(event: PointerEvent<HTMLDivElement>) {
    // Touch has no hover: a tap on the picture toggles the controls.
    if (event.pointerType === "touch" && event.target === event.currentTarget.querySelector("video")) chrome.toggle();
  }

  const showVolumeOff = muted || volume === 0;

  return (
    <div
      ref={containerRef}
      className={styles.player}
      data-chrome={chrome.visible ? "shown" : "hidden"}
      data-pip={pictureInPicture || undefined}
      onPointerMove={onStagePointer}
      onPointerDown={onStagePointer}
      onPointerUp={onStagePointerUp}
    >
      <video
        ref={videoRef}
        className={styles.video}
        autoPlay
        playsInline
        onDoubleClick={() => void fullscreen.toggle()}
      />
      {!stream && placeholder && (
        <p className={styles.placeholder} role="status">
          {placeholder}
        </p>
      )}

      <div className={styles.top} aria-hidden={!chrome.visible}>
        <span className={styles.badge}>
          <span className="lamp" data-lit={stream !== null} />
          <span className={styles.code}>{code}</span>
        </span>
      </div>

      <div
        className={styles.bar}
        onPointerEnter={(event) => event.pointerType !== "touch" && chrome.setPinned(true)}
        onPointerLeave={() => chrome.setPinned(false)}
        onFocus={() => chrome.setPinned(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) chrome.setPinned(false);
        }}
      >
        <button type="button" className={styles.control} onClick={onLeave}>
          <BackIcon /> <span className={styles.controlText}>{t.viewing.leave}</span>
        </button>
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.control}
          onClick={toggleMuted}
          aria-label={muted ? t.viewing.unmute : t.viewing.mute}
          title={muted ? t.viewing.unmute : t.viewing.mute}
          aria-pressed={muted}
        >
          {showVolumeOff ? <MutedIcon /> : <VolumeIcon />}
        </button>
        {volumeSupported && (
          <input
            type="range"
            className={styles.volume}
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label={t.viewing.volume}
            style={{ "--fill": `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties}
          />
        )}
        {canFloat && (
          <button
            type="button"
            className={styles.control}
            onClick={openFloating}
            aria-label={t.viewing.miniPlayer}
            title={t.viewing.miniPlayer}
          >
            <MiniPlayerIcon />
          </button>
        )}
        <button
          type="button"
          className={styles.control}
          onClick={() => void fullscreen.toggle()}
          aria-label={fullscreen.isFullscreen ? t.viewing.exitFullscreen : t.viewing.fullscreen}
          title={fullscreen.isFullscreen ? t.viewing.exitFullscreen : t.viewing.fullscreen}
        >
          {fullscreen.isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </button>
      </div>
    </div>
  );
}
