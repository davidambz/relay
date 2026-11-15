// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "react";
import type { ViewerEndReason } from "@relay/core";
import { useI18n } from "../i18n/I18nContext";
import { FloatingPlayer } from "../player/FloatingPlayer";
import { Player } from "../player/Player";
import { useChildWindow } from "../player/useChildWindow";
import { useVolume } from "../player/useVolume";
import { useViewerSession } from "../session/useViewerSession";
import styles from "./Viewing.module.css";

interface ViewingProps {
  code: string;
  /** The app is in the system's Picture-in-Picture window (Android). */
  pictureInPicture?: boolean;
  onLeave: () => void;
  onEnded: (reason: ViewerEndReason) => void;
}

/**
 * Watching a broadcast: the session, the full-bleed player, and the
 * mini-player window. Both players read one stream and one volume state;
 * only the visible one is fed the stream.
 */
export function Viewing({ code, onLeave, onEnded, pictureInPicture = false }: ViewingProps) {
  const { t } = useI18n();
  const session = useViewerSession(code);
  const audio = useVolume();
  const [floating, setFloating] = useState(false);
  const closeFloating = useCallback(() => setFloating(false), []);
  const floatingContainer = useChildWindow(floating, closeFloating);
  const stream = session.status === "playing" ? session.stream : null;

  useEffect(() => {
    if (session.status === "ended") onEnded(session.reason);
  }, [session, onEnded]);

  return (
    <div className={styles.viewing}>
      <Player
        stream={floatingContainer ? null : stream}
        code={code}
        placeholder={floatingContainer ? undefined : t.viewing.connecting(code)}
        audio={audio}
        onLeave={onLeave}
        onFloatingWindow={() => setFloating(true)}
        pictureInPicture={pictureInPicture}
      />
      {floatingContainer && (
        <FloatingPlayer
          container={floatingContainer}
          stream={stream}
          audio={audio}
          onReturn={closeFloating}
        />
      )}
    </div>
  );
}
