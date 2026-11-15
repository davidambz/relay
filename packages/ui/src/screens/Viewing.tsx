// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef } from "react";
import type { ViewerEndReason } from "@relay/core";
import { Button } from "../components/Button";
import { BackIcon } from "../components/icons";
import { useI18n } from "../i18n/I18nContext";
import { useViewerSession } from "../session/useViewerSession";
import screen from "./Screen.module.css";
import styles from "./Viewing.module.css";

interface ViewingProps {
  code: string;
  onLeave: () => void;
  onEnded: (reason: ViewerEndReason) => void;
}

/**
 * Watching a broadcast. A basic player for now: the stream in a bezel and a
 * Leave button. Volume, fullscreen, shortcuts and auto-hiding controls
 * come with the full player.
 */
export function Viewing({ code, onLeave, onEnded }: ViewingProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const session = useViewerSession(code);
  const stream = session.status === "playing" ? session.stream : null;

  useEffect(() => {
    if (session.status === "ended") onEnded(session.reason);
  }, [session, onEnded]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.srcObject = stream;
  }, [stream]);

  return (
    <div className={screen.screen}>
      <section className={screen.panel} aria-labelledby="viewing-label">
        <div className={screen.panelHead}>
          <h2 id="viewing-label" className="label">
            {t.viewing.label}
          </h2>
          <span className={styles.status}>
            <span className="lamp" data-lit={stream !== null} />
            <span className={styles.code}>{code}</span>
          </span>
        </div>
        <div className={screen.bezel}>
          <video ref={videoRef} className={[screen.screenArea, styles.video].join(" ")} autoPlay playsInline />
          {!stream && (
            <p className={styles.connecting} role="status">
              {t.viewing.connecting(code)}
            </p>
          )}
        </div>
      </section>

      <div className={screen.actions}>
        <Button variant="ghost" onClick={onLeave}>
          <BackIcon /> {t.viewing.leave}
        </Button>
      </div>
    </div>
  );
}
