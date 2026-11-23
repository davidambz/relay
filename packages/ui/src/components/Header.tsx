// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useI18n } from "../i18n/I18nContext";
import { GearIcon, RelayMark } from "./icons";
import type { HeaderStatus } from "../navigation";
import styles from "./Header.module.css";

interface HeaderProps {
  status: HeaderStatus;
  /** Opens the app's settings; no button without it. */
  onSettings?: () => void;
}

/** The status lamp is lit while broadcasting or watching, the app's two active states. */
export function Header({ status, onSettings }: HeaderProps) {
  const { t } = useI18n();
  const label = {
    idle: t.app.statusIdle,
    live: t.app.statusLive,
    watching: t.app.statusWatching,
    "live-watching": t.app.statusLiveWatching,
  }[status];
  return (
    <header className={styles.header}>
      <div className={styles.nameplate}>
        <RelayMark />
        <span className={styles.wordmark}>Relay</span>
      </div>
      <div className={styles.end}>
        <div className={styles.status} role="status">
          <span className="lamp" data-lit={status !== "idle"} />
          <span className="label">{label}</span>
        </div>
        {onSettings && (
          <button
            type="button"
            className={styles.settings}
            onClick={onSettings}
            aria-label={t.settings.title}
            title={t.settings.title}
          >
            <GearIcon />
          </button>
        )}
      </div>
    </header>
  );
}
