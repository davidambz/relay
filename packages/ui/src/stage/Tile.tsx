// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { MutedIcon } from "../components/icons";
import { useI18n } from "../i18n/I18nContext";
import styles from "./Tile.module.css";

interface TileProps {
  stream: MediaStream | null;
  /** Bump to re-point the video when the stream's tracks were swapped. */
  streamVersion?: number;
  name: string;
  /** Shown before the name (e.g. a monitor glyph on the person's own tile). */
  icon?: ReactNode;
  /** Lit "live" chip: the broadcast is going out (own) or coming in (watched). */
  live: boolean;
  /** The frame rate, when known (the person's own broadcast). */
  fps?: number;
  /** Always silent (the person's own preview), else follows volume/muted. */
  silent?: boolean;
  volume?: number;
  muted?: boolean;
  /** Centered over the black while there's no picture. */
  placeholder?: string;
  /** "focus": the big one. "thumb": a button in the strip that focuses it. */
  variant: "focus" | "thumb";
  onSelect?: () => void;
  onDoubleClick?: () => void;
  videoRef?: RefObject<HTMLVideoElement | null>;
}

/** The picture's height as delivered, for the "1080P" readout. */
function useVideoHeight(videoRef: RefObject<HTMLVideoElement | null>) {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => setHeight(video.videoHeight);
    video.addEventListener("resize", update);
    video.addEventListener("loadedmetadata", update);
    return () => {
      video.removeEventListener("resize", update);
      video.removeEventListener("loadedmetadata", update);
    };
  }, [videoRef]);
  return height;
}

/**
 * One broadcast on the stage: the picture, a name tag in the corner and,
 * on the big one, the format and "live" chips.
 */
export function Tile({
  stream,
  streamVersion = 0,
  name,
  icon,
  live,
  fps,
  silent = false,
  volume = 1,
  muted = false,
  placeholder,
  variant,
  onSelect,
  onDoubleClick,
  videoRef: externalRef,
}: TileProps) {
  const { t } = useI18n();
  const ownRef = useRef<HTMLVideoElement>(null);
  const videoRef = externalRef ?? ownRef;
  const height = useVideoHeight(videoRef);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    return () => {
      video.srcObject = null;
    };
  }, [videoRef, stream, streamVersion]);

  // Set as properties: React's `muted` attribute doesn't track changes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = silent || muted;
    video.volume = volume;
  }, [videoRef, silent, muted, volume]);

  const format = height > 0 ? `${height}P${fps ? ` ${fps}FPS` : ""}` : null;
  const content = (
    <>
      <video ref={videoRef} className={styles.video} autoPlay playsInline muted onDoubleClick={onDoubleClick} />
      {!stream && placeholder && (
        <span className={styles.placeholder} role="status">
          {placeholder}
        </span>
      )}
      <span className={styles.chips}>
        {variant === "focus" && format && <span className={[styles.chip, "tabularNums"].join(" ")}>{format}</span>}
        {live && (
          <span className={[styles.chip, styles.liveChip].join(" ")}>
            <span className="lamp" data-lit aria-hidden />
            {variant === "focus" && t.stage.onAir}
          </span>
        )}
      </span>
      <span className={styles.nameTag}>
        {icon}
        <span className={styles.name}>{name}</span>
        {!silent && muted && <MutedIcon className={styles.mutedIcon} />}
      </span>
    </>
  );

  if (variant === "thumb") {
    return (
      <button type="button" className={[styles.tile, styles.thumb].join(" ")} onClick={onSelect} aria-label={t.stage.showTile(name)}>
        {content}
      </button>
    );
  }
  return <div className={[styles.tile, styles.focus].join(" ")}>{content}</div>;
}
