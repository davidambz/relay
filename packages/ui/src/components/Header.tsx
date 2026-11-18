// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useI18n } from "../i18n/I18nContext";
import { BroadcastIcon, RelayMark, WatchIcon } from "./icons";
import { Segmented } from "./Segmented";
import type { HeaderStatus, HeaderView } from "../navigation";
import styles from "./Header.module.css";

interface HeaderProps {
  status: HeaderStatus;
  /**
   * Broadcasting from another screen: the status becomes a button back
   * to the broadcast's controls.
   */
  onReturnToLive?: () => void;
  /** Broadcasting and watching at once: which of the two is on screen. */
  view?: { current: HeaderView; onChange: (view: HeaderView) => void };
}

/** The status lamp is lit while broadcasting or watching, the app's two active states. */
export function Header({ status, onReturnToLive, view }: HeaderProps) {
  const { t } = useI18n();
  const label = {
    idle: t.app.statusIdle,
    live: t.app.statusLive,
    watching: t.app.statusWatching,
    "live-watching": t.app.statusLiveWatching,
  }[status];
  const indicator = (
    <>
      <span className="lamp" data-lit={status !== "idle"} />
      <span className="label">{label}</span>
    </>
  );
  return (
    <header className={styles.header}>
      <div className={styles.nameplate}>
        <RelayMark />
        <span className={styles.wordmark}>Relay</span>
      </div>
      <div className={styles.end}>
        {view && (
          <Segmented
            label={t.app.viewsLabel}
            value={view.current}
            onChange={view.onChange}
            options={[
              { value: "live", label: t.app.viewLive, icon: <BroadcastIcon /> },
              { value: "watching", label: t.app.viewWatching, icon: <WatchIcon /> },
            ]}
          />
        )}
        {onReturnToLive ? (
          <button
            type="button"
            className={[styles.status, styles.statusButton].join(" ")}
            onClick={onReturnToLive}
            title={t.app.returnToLive}
            aria-label={`${label}. ${t.app.returnToLive}`}
          >
            {indicator}
          </button>
        ) : (
          <div className={styles.status} role="status">
            {indicator}
          </div>
        )}
      </div>
    </header>
  );
}
