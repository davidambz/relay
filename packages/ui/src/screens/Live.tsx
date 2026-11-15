// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from "react";
import { generateCode } from "@relay/core";
import { Button } from "../components/Button";
import { CopyIcon } from "../components/icons";
import { useI18n } from "../i18n/I18nContext";
import type { StartedBroadcast } from "./SourcePicker";
import screen from "./Screen.module.css";
import styles from "./Live.module.css";

interface LiveProps {
  broadcast: StartedBroadcast;
  onStop: () => void;
  /** The captured source went away on its own (window closed). */
  onSourceEnded: () => void;
}

export function Live({ broadcast, onStop, onSourceEnded }: LiveProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [code] = useState(() => generateCode());
  const [copied, setCopied] = useState(false);
  const viewers = 0;

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

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch (error) {
      console.error("Failed to copy the code", error);
    }
  }

  return (
    <div className={screen.screen}>
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
            <div className={styles.visor}>
              <output className={styles.code} aria-live="polite">
                {code}
              </output>
            </div>
            <Button variant="secondary" onClick={() => void copyCode()}>
              <CopyIcon /> {copied ? t.live.copied : t.live.copy}
            </Button>
          </section>

          <section className={screen.panel} aria-labelledby="live-viewers">
            <div className={screen.panelHead}>
              <h2 id="live-viewers" className="label">
                {t.live.viewersLabel}
              </h2>
              <span className={styles.readout}>
                <span className="lamp" data-lit={viewers > 0} />
                <span className="tabularNums">{viewers}</span>
              </span>
            </div>
            <p className={screen.description}>{t.live.connectionPending}</p>
          </section>

          <Button variant="danger" onClick={onStop} className={styles.stop}>
            {t.live.stop}
          </Button>
        </aside>
      </div>
    </div>
  );
}
