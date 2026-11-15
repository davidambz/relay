// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useI18n } from "../i18n/I18nContext";
import { RelayMark } from "./icons";
import styles from "./Header.module.css";

export type HeaderStatus = "idle" | "live" | "watching";

/** The status lamp is lit while broadcasting or watching, the app's two active states. */
export function Header({ status }: { status: HeaderStatus }) {
  const { t } = useI18n();
  const label = { idle: t.app.statusIdle, live: t.app.statusLive, watching: t.app.statusWatching }[status];
  return (
    <header className={styles.header}>
      <div className={styles.nameplate}>
        <RelayMark />
        <span className={styles.wordmark}>Relay</span>
      </div>
      <div className={styles.status} role="status">
        <span className="lamp" data-lit={status !== "idle"} />
        <span className="label">{label}</span>
      </div>
    </header>
  );
}
