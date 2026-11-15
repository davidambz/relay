// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, GripIcon, MutedIcon, ReturnIcon, VolumeIcon } from "../components/icons";
import { useI18n } from "../i18n/I18nContext";
import { actionForKey } from "./shortcuts";
import { useAutoHide } from "./useAutoHide";
import type { VolumeControls } from "./useVolume";
import styles from "./FloatingPlayer.module.css";

interface FloatingPlayerProps {
  container: HTMLElement;
  stream: MediaStream | null;
  audio: VolumeControls;
  onReturn: () => void;
  onLeave: () => void;
}

/**
 * The mini player's content, portaled into the floating window.
 *
 * The picture itself is NOT a drag region: on Windows a
 * -webkit-app-region: drag area swallows mouse events, so hover would
 * never reveal the controls. Instead, moving the pointer over the picture
 * shows a bar (mute, a drag grip, back-to-main, leave) that fades after a
 * few still seconds, like the main player's chrome. Double-clicking the
 * picture also goes back to the main window.
 */
export function FloatingPlayer({ container, stream, audio, onReturn, onLeave }: FloatingPlayerProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { volume, muted, toggleMuted } = audio;
  const chrome = useAutoHide();

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

  return createPortal(
    <div
      className={styles.floating}
      data-chrome={chrome.visible ? "shown" : "hidden"}
      onPointerMove={chrome.show}
      onPointerDown={chrome.show}
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
        <span className={styles.grip} title={t.viewing.dragMiniPlayer} aria-hidden>
          <GripIcon />
        </span>
        <button type="button" className={styles.control} onClick={onReturn} aria-label={t.viewing.returnToMain} title={t.viewing.returnToMain}>
          <ReturnIcon />
        </button>
        <button type="button" className={styles.control} onClick={onLeave} aria-label={t.viewing.leave} title={t.viewing.leave}>
          <CloseIcon />
        </button>
      </div>
    </div>,
    container,
  );
}
