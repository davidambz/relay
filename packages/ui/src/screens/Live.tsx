// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from "react";
import { applyQualityToTrack, videoProfileFor, type StreamQuality } from "@relay/core";
import { Button } from "../components/Button";
import { CopyIcon, RefreshIcon } from "../components/icons";
import { QualityPicker } from "../components/QualityPicker";
import { Toggle } from "../components/Toggle";
import { useI18n } from "../i18n/I18nContext";
import { usePlatform } from "../platform/PlatformContext";
import { useHostSession } from "../session/useHostSession";
import { SourcePicker, type StartedBroadcast } from "./SourcePicker";
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
  const [session, { setEncoderSettings, replaceSource }] = useHostSession(
    broadcast.stream,
    encoderSettingsFor(broadcast.quality),
  );
  const [copied, setCopied] = useState(false);
  const live = session.status === "live" ? session : null;
  // Picking another source mid-broadcast; the session keeps running.
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState(false);
  const [sourceName, setSourceName] = useState(broadcast.sourceName);
  // Bumped when the broadcast's tracks are swapped for a new source.
  const [sourceVersion, setSourceVersion] = useState(0);

  // The preview remounts after the picker closes and after a switch, so
  // it's re-pointed at the (same, but re-tracked) stream each time.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = broadcast.stream;
    return () => {
      video.srcObject = null;
    };
  }, [broadcast.stream, switching, sourceVersion]);

  // Closing the shared window ends its video track; end the broadcast with
  // it. Re-subscribed after a switch, to whichever source is live now.
  useEffect(() => {
    const [track] = broadcast.stream.getVideoTracks();
    if (!track) return;
    const handleEnded = () => onSourceEnded();
    track.addEventListener("ended", handleEnded);
    return () => track.removeEventListener("ended", handleEnded);
  }, [broadcast.stream, onSourceEnded, sourceVersion]);

  async function switchSource(next: StartedBroadcast) {
    const oldTracks = broadcast.stream.getTracks();
    try {
      await replaceSource(next.stream);
    } catch (error) {
      console.error("Couldn't switch the source", error);
      for (const track of next.stream.getTracks()) track.stop();
      setSwitchError(true);
      setSwitching(false);
      return;
    }
    for (const track of oldTracks) track.stop();
    // Sound stays as the broadcaster left it (muted stays muted).
    for (const track of broadcast.stream.getAudioTracks()) track.enabled = audioOn;
    setSourceName(next.sourceName);
    if (next.quality.resolution !== quality.resolution || next.quality.fps !== quality.fps) {
      setQuality(next.quality);
      onQualityChange(next.quality);
    }
    // A new track: reapply encoder settings for its quality either way.
    setEncoderSettings(encoderSettingsFor(next.quality));
    setSwitchError(false);
    setSourceVersion((version) => version + 1);
    setSwitching(false);
  }

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

  if (switching) {
    return (
      <SourcePicker
        mode="switch"
        audio={hasAudio}
        notice={t.live.switchingNotice}
        onBack={() => setSwitching(false)}
        onStarted={(next) => void switchSource(next)}
      />
    );
  }

  return (
    <div className={screen.screen}>
      {switchError && (
        <p className={screen.error} role="alert">
          {t.live.switchFailed}
        </p>
      )}
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
            <span className={styles.sourceName} title={sourceName}>
              {sourceName}
            </span>
            {live && (
              <Button variant="ghost" onClick={() => setSwitching(true)} className={styles.changeSource}>
                <RefreshIcon /> {t.live.changeSource}
              </Button>
            )}
          </div>
          <div className={screen.bezel}>
            <video key={sourceVersion} ref={videoRef} className={screen.screenArea} autoPlay playsInline muted />
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
                  {live ? t.live.viewersCount(live.viewers.length, live.maxViewers) : "–"}
                </span>
              </span>
            </div>
            {live && live.viewers.length > 0 && (
              // One lit lamp per connected viewer.
              <div className={styles.lamps} aria-hidden>
                {live.viewers.map((id) => (
                  <span key={id} className="lamp" data-lit />
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
