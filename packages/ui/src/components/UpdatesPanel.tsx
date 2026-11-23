// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useUpdateStatus } from "../hooks/useUpdateStatus";
import { useI18n } from "../i18n/I18nContext";
import { usePlatform } from "../platform/PlatformContext";
import { Button } from "./Button";
import styles from "./UpdatesPanel.module.css";

/**
 * The Updates section of Settings: version, "check for updates" and
 * "update now" (Umbra's UpdatesPanel, Relay-sized). Where the shell can't
 * update itself, just the version.
 */
export function UpdatesPanel() {
  const { t } = useI18n();
  const platform = usePlatform();
  const updates = platform.capabilities.selfUpdate ? platform.updates : undefined;
  const status = useUpdateStatus();

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
    <section className={styles.panel} aria-labelledby="updates-heading">
      <h3 id="updates-heading" className="label">
        {t.updates.heading}
      </h3>
      <div className={styles.row}>
        <div className={styles.text}>
          <span className={styles.version}>{t.updates.currentVersion(platform.appVersion)}</span>
          {message && (
            <span className={status.state === "failed" ? styles.error : styles.message} role="status">
              {message}
            </span>
          )}
        </div>
        {updates &&
          (status.state === "available" ? (
            <Button variant="primary" onClick={() => void updates.apply().catch(() => {})}>
              {t.updates.updateNow}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => void updates.check()} disabled={busy}>
              {t.updates.check}
            </Button>
          ))}
      </div>
    </section>
  );
}
