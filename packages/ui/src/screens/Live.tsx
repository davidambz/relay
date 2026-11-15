// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from "react";
import { applyQualityToTrack, videoProfileFor, type StreamQuality } from "@relay/core";
import { Button } from "../components/Button";
import { CopyIcon } from "../components/icons";
import { QualityPicker } from "../components/QualityPicker";
import { Toggle } from "../components/Toggle";
import { useI18n } from "../i18n/I18nContext";
import { usePlatform } from "../platform/PlatformContext";
import { useHostSession } from "../session/useHostSession";
import type { StartedBroadcast } from "./SourcePicker";
import screen from "./Screen.module.css";
import styles from "./Live.module.css";

interface LiveProps {
  broadcast: StartedBroadcast;
  onStop: () => void;
  /** The captured source went away on its own (window closed). */
  onSourceEnded: () => void;
  /** Start over with a fresh session (after the signaling server failed). */
  onRetry: () => void;
  /** Remember a quality change made mid-broadcast. */
  onQualityChange: (quality: StreamQuality) => void;
}

function encoderSettingsFor(quality: StreamQuality) {
  const { degradationPreference, bitrateScale } = videoProfileFor(quality);
  return { degradationPreference, bitrateScale };
}

export function Live({ broadcast, onStop, onSourceEnded, onRetry, onQualityChange }: LiveProps) {
  const { t } = useI18n();
  const platform = usePlatform();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [quality, setQuality] = useState<StreamQuality>(broadcast.quality);
  const [qualityError, setQualityError] = useState(false);
  const hasAudio = broadcast.stream.getAudioTracks().length > 0;
  const [audioOn, setAudioOn] = useState(hasAudio);

  // Muting mid-broadcast disables the track (viewers get silence) rather
  // than removing it, so nothing renegotiates and unmuting is instant.
  function toggleAudio(next: boolean) {
    for (const track of broadcast.stream.getAudioTracks()) track.enabled = next;
    setAudioOn(next);
  }
  const [session, setEncoderSettings] = useHostSession(broadcast.stream, encoderSettingsFor(broadcast.quality));
  const [copied, setCopied] = useState(false);
  const live = session.status === "live" ? session : null;

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.srcObject = broadcast.stream;
    return () => {
      if (video) video.srcObject = null;
    };
  }, [broadcast.stream]);

  // Closing the shared window ends its video track; end the broadcast with it.
  useEffect(() => {
    const [track] = broadcast.stream.getVideoTracks();
    if (!track) return;
    const handleEnded = () => onSourceEnded();
    track.addEventListener("ended", handleEnded);
    return () => track.removeEventListener("ended", handleEnded);
  }, [broadcast.stream, onSourceEnded]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function changeQuality(next: StreamQuality) {
    setQuality(next);
    setQualityError(false);
    onQualityChange(next);
    setEncoderSettings(encoderSettingsFor(next));
    const [track] = broadcast.stream.getVideoTracks();
    if (!track) return;
    try {
      await applyQualityToTrack(track, next);
    } catch (error) {
      console.warn("Couldn't apply quality", error);
      setQualityError(true);
    }
  }

  async function copyCode() {
    if (!live) return;
    try {
      await platform.copyText(live.code);
      setCopied(true);
    } catch (error) {
      console.error("Failed to copy the code", error);
    }
  }

  return (
    <div className={screen.screen}>
      {session.status === "failed" && (
        <div className={screen.error} role="alert">
          <p>{t.live.startFailed}</p>
          <Button variant="secondary" onClick={onRetry} className={styles.retry}>
            {t.live.retry}
          </Button>
        </div>
      )}
      {live && !live.signaling && (
        <p className={screen.note} role="status">
          {t.live.reconnecting}
        </p>
      )}

      <div className={styles.layout}>
        <section className={screen.panel} aria-labelledby="live-preview">
          <div className={screen.panelHead}>
            <h2 id="live-preview" className="label">
              {t.live.previewLabel}
            </h2>
            <span className={styles.sourceName} title={broadcast.sourceName}>
              {broadcast.sourceName}
            </span>
          </div>
          <div className={screen.bezel}>
            <video ref={videoRef} className={screen.screenArea} autoPlay playsInline muted />
          </div>
        </section>

        <aside className={styles.side}>
          <section className={screen.panel} aria-labelledby="live-code">
            <h2 id="live-code" className="label">
              {t.live.codeLabel}
            </h2>
            <div className={styles.visor} data-pending={!live}>
              <output className={styles.code} aria-live="polite" aria-busy={!live}>
                {live ? live.code : t.live.codePending}
              </output>
            </div>
            <Button variant="secondary" onClick={() => void copyCode()} disabled={!live}>
              <CopyIcon /> {copied ? t.live.copied : t.live.copy}
            </Button>
          </section>

          <section className={screen.panel} aria-labelledby="live-viewers">
            <div className={screen.panelHead}>
              <h2 id="live-viewers" className="label">
                {t.live.viewersLabel}
              </h2>
              <span className={styles.readout}>
                <span className="tabularNums">
                  {live ? t.live.viewersOf(live.viewers.length, live.maxViewers) : "–"}
                </span>
              </span>
            </div>
            {live && (
              // One lamp per seat: lit seats are connected viewers.
              <div className={styles.lamps} aria-hidden>
                {Array.from({ length: live.maxViewers }, (_, index) => (
                  <span key={index} className="lamp" data-lit={index < live.viewers.length} />
                ))}
              </div>
            )}
            {live && live.viewers.length === 0 && <p className={screen.description}>{t.live.noViewersYet}</p>}
          </section>

          <section className={screen.panel} aria-labelledby="live-quality">
            <h2 id="live-quality" className="label">
              {t.live.qualityLabel}
            </h2>
            <QualityPicker value={quality} onChange={(next) => void changeQuality(next)} />
            {hasAudio && <Toggle label={t.quality.audioLabel} checked={audioOn} onChange={toggleAudio} />}
            {qualityError && (
              <p className={screen.error} role="alert">
                {t.quality.applyFailed}
              </p>
            )}
          </section>

          <Button variant="danger" onClick={onStop} className={styles.stop}>
            {t.live.stop}
          </Button>
        </aside>
      </div>
    </div>
  );
}
