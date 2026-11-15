// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useRef, type PointerEvent } from "react";
import { BackIcon, ExitFullscreenIcon, FullscreenIcon, MutedIcon, VolumeIcon } from "../components/icons";
import { useI18n } from "../i18n/I18nContext";
import { actionForKey, isTypingTarget } from "./shortcuts";
import { useAutoHide } from "./useAutoHide";
import { useFullscreen } from "./useFullscreen";
import { canSetVolume, useVolume } from "./useVolume";
import styles from "./Player.module.css";

interface PlayerProps {
  stream: MediaStream | null;
  code: string;
  /** Shown centered on the stage while there's no stream yet. */
  placeholder?: string;
  onLeave: () => void;
}

export function Player({ stream, code, placeholder, onLeave }: PlayerProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const chrome = useAutoHide();
  const fullscreen = useFullscreen(containerRef);
  const { volume, muted, setVolume, toggleMuted } = useVolume();
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

  // Shortcuts: global while the player is on screen, except when typing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTypingTarget(event.target)) return;
      const action = actionForKey(event);
      if (!action) return;
      if (action === "fullscreen") void fullscreen.toggle();
      else if (action === "mute") toggleMuted();
      else return; // "floating" arrives with the floating player
      event.preventDefault();
      chrome.show();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen, toggleMuted, chrome]);

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
