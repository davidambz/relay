// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState } from "react";
import type { UpdateStatus } from "@relay/core";
import { useI18n } from "../i18n/I18nContext";
import { usePlatform } from "../platform/PlatformContext";
import { Button } from "./Button";
import screen from "../screens/Screen.module.css";
import styles from "./UpdatesPanel.module.css";

/** Version, "check for updates" and "update now" (Umbra's UpdatesPanel, Relay-sized). */
export function UpdatesPanel() {
  const { t } = useI18n();
  const platform = usePlatform();
  const updates = platform.updates;
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });

  useEffect(() => {
    if (!updates) return;
    let cancelled = false;
    let pushed = false;
    // A pushed status is always newer than the initial snapshot, so a slow
    // getStatus() must not overwrite one.
    const unsubscribe = updates.onStatus((next) => {
      pushed = true;
      setStatus(next);
    });
    void updates.getStatus().then((current) => {
      if (!cancelled && !pushed) setStatus(current);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [updates]);

  if (!updates || !platform.capabilities.selfUpdate) return null;

  const busy = status.state === "checking" || status.state === "downloading" || status.state === "installing";
  const message = (() => {
    switch (status.state) {
      case "checking":
        return t.updates.checking;
      case "up-to-date":
        return t.updates.upToDate;
      case "available":
        return t.updates.available(status.latestVersion);
      case "downloading":
      case "installing":
        return t.updates.installing(status.latestVersion);
      case "failed":
        return t.updates.failed;
      default:
        return null;
    }
  })();

  return (
    <section className={[screen.panel, styles.panel].join(" ")} aria-labelledby="updates-heading">
      <div className={styles.row}>
        <div className={styles.text}>
          <h2 id="updates-heading" className="label">
            {t.updates.heading}
          </h2>
          <span className={styles.version}>{t.updates.currentVersion(platform.appVersion)}</span>
          {message && (
            <span className={status.state === "failed" ? styles.error : styles.message} role="status">
              {message}
            </span>
          )}
        </div>
        {status.state === "available" ? (
          <Button variant="primary" onClick={() => void updates.apply().catch(() => {})}>
            {t.updates.updateNow}
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => void updates.check()} disabled={busy}>
            {t.updates.check}
          </Button>
        )}
      </div>
    </section>
  );
}
