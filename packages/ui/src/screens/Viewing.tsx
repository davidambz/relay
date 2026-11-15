// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect } from "react";
import type { ViewerEndReason } from "@relay/core";
import { useI18n } from "../i18n/I18nContext";
import { Player } from "../player/Player";
import { useViewerSession } from "../session/useViewerSession";
import styles from "./Viewing.module.css";

interface ViewingProps {
  code: string;
  onLeave: () => void;
  onEnded: (reason: ViewerEndReason) => void;
}

/** Watching a broadcast: the session plus the full-bleed player. */
export function Viewing({ code, onLeave, onEnded }: ViewingProps) {
  const { t } = useI18n();
  const session = useViewerSession(code);

  useEffect(() => {
    if (session.status === "ended") onEnded(session.reason);
  }, [session, onEnded]);

  return (
    <div className={styles.viewing}>
      <Player
        stream={session.status === "playing" ? session.stream : null}
        code={code}
        placeholder={t.viewing.connecting(code)}
        onLeave={onLeave}
      />
    </div>
  );
}
