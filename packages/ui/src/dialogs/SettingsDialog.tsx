// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "react";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { UpdatesPanel } from "../components/UpdatesPanel";
import { useI18n } from "../i18n/I18nContext";
import { usePlatform } from "../platform/PlatformContext";
import screen from "../screens/Screen.module.css";
import styles from "./SettingsDialog.module.css";

/** The app's settings: updates and, where the shell keeps one, the log. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const platform = usePlatform();
  const [openFailed, setOpenFailed] = useState(false);

  async function openLogs() {
    setOpenFailed(false);
    try {
      await platform.openLogFolder?.();
    } catch (error) {
      console.error("Couldn't open the log folder", error);
      setOpenFailed(true);
    }
  }

  return (
    <Dialog title={t.settings.title} onClose={onClose}>
      <div className={styles.sections}>
        <UpdatesPanel />
        {platform.openLogFolder && (
          <section className={styles.section} aria-labelledby="settings-logs">
            <h3 id="settings-logs" className="label">
              {t.settings.logsHeading}
            </h3>
            <p className={screen.description}>{t.settings.logsDescription}</p>
            <Button variant="secondary" className={styles.action} onClick={() => void openLogs()}>
              {t.settings.openLogs}
            </Button>
            {openFailed && (
              <p className={screen.error} role="alert">
                {t.settings.openLogsFailed}
              </p>
            )}
          </section>
        )}
      </div>
    </Dialog>
  );
}
