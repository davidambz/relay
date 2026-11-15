// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { GripIcon, MutedIcon, ReturnIcon, VolumeIcon } from "../components/icons";
import { useI18n } from "../i18n/I18nContext";
import { usePlatform } from "../platform/PlatformContext";
import { actionForKey } from "./shortcuts";
import { canSetVolume, type VolumeControls } from "./useVolume";
import styles from "./FloatingPlayer.module.css";

interface FloatingPlayerProps {
  container: HTMLElement;
  stream: MediaStream | null;
  audio: VolumeControls;
  onReturn: () => void;
}

/**
 * The mini player's content, portaled into the floating window.
 *
 * Its controls (mute, volume, a drag grip, back to the main window) show
 * only while the mouse is over the window, and stay out of the picture
 * otherwise. There's deliberately no "leave" here: the mini player is for
 * watching, and going back to the main window (button, double-click or P)
 * is the way out.
 *
 * Hover comes from the shell when it can track it (Electron polls the
 * cursor: Windows sends the page no mouse events over the drag grip),
 * else from the page's own pointer events.
 */
export function FloatingPlayer({ container, stream, audio, onReturn }: FloatingPlayerProps) {
  const { t } = useI18n();
  const platform = usePlatform();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { volume, muted, setVolume, toggleMuted } = audio;
  const volumeSupported = useMemo(() => canSetVolume(), []);
  const [hovered, setHovered] = useState(false);
  const shellTracksHover = platform.onFloatingHover !== undefined;

  useEffect(() => platform.onFloatingHover?.(setHovered), [platform]);

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

  // Shortcuts live on the child window: M mutes, P goes back.
  useEffect(() => {
    const view = container.ownerDocument.defaultView;
    if (!view) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const action = actionForKey(event);
      if (action === "mute") toggleMuted();
      else if (action === "floating") onReturn();
    };
    view.addEventListener("keydown", onKeyDown);
    return () => view.removeEventListener("keydown", onKeyDown);
  }, [container, toggleMuted, onReturn]);

  const level = muted ? 0 : volume;

  return createPortal(
    <div
      className={styles.floating}
      data-chrome={hovered ? "shown" : "hidden"}
      onPointerEnter={shellTracksHover ? undefined : () => setHovered(true)}
      onPointerLeave={shellTracksHover ? undefined : () => setHovered(false)}
    >
      <video ref={videoRef} className={styles.video} autoPlay playsInline onDoubleClick={onReturn} />
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.control}
          onClick={toggleMuted}
          aria-label={muted ? t.viewing.unmute : t.viewing.mute}
          title={muted ? t.viewing.unmute : t.viewing.mute}
        >
          {muted || volume === 0 ? <MutedIcon /> : <VolumeIcon />}
        </button>
        {volumeSupported && (
          <input
            type="range"
            className={styles.volume}
            min={0}
            max={1}
            step={0.05}
            value={level}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label={t.viewing.volume}
            style={{ "--fill": `${level * 100}%` } as CSSProperties}
          />
        )}
        <span className={styles.grip} title={t.viewing.dragMiniPlayer} aria-hidden>
          <GripIcon />
        </span>
        <button
          type="button"
          className={styles.control}
          onClick={onReturn}
          aria-label={t.viewing.returnToMain}
          title={t.viewing.returnToMain}
        >
          <ReturnIcon />
        </button>
      </div>
    </div>,
    container,
  );
}
