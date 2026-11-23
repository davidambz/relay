// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useUpdateStatus } from "../hooks/useUpdateStatus";
import { useI18n } from "../i18n/I18nContext";
import { usePlatform } from "../platform/PlatformContext";
import { Button } from "./Button";
import styles from "./UpdateNotice.module.css";

/** On the home screen only while there's a new version to install (or fetch). */
export function UpdateNotice() {
  const { t } = useI18n();
  const { updates } = usePlatform();
  const status = useUpdateStatus();
  if (!updates || (status.state !== "available" && status.state !== "ready")) return null;
  const ready = status.state === "ready";
  return (
    <div className={styles.notice} role="status">
      <span className="lamp" data-lit aria-hidden />
      <span className={styles.text}>
        {ready ? t.updates.ready(status.latestVersion) : t.updates.available(status.latestVersion)}
      </span>
      <Button variant="primary" onClick={() => void updates.apply().catch(() => {})}>
        {ready ? t.updates.installNow : t.updates.updateNow}
      </Button>
    </div>
  );
}
