// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useI18n } from "../i18n/I18nContext";
import { RelayMark } from "./icons";
import styles from "./Header.module.css";

export function Header({ live }: { live: boolean }) {
  const { t } = useI18n();
  return (
    <header className={styles.header}>
      <div className={styles.nameplate}>
        <RelayMark />
        <span className={styles.wordmark}>Relay</span>
      </div>
      <div className={styles.status} role="status">
        <span className="lamp" data-lit={live} />
        <span className="label">{live ? t.app.statusLive : t.app.statusIdle}</span>
      </div>
    </header>
  );
}
