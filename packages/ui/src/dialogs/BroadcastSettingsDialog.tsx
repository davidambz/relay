// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { StreamQuality } from "@relay/core";
import { Dialog } from "../components/Dialog";
import { QualityPicker } from "../components/QualityPicker";
import { Toggle } from "../components/Toggle";
import { useI18n } from "../i18n/I18nContext";
import type { Broadcast } from "../session/useBroadcast";
import screen from "../screens/Screen.module.css";
import styles from "./GoLiveDialog.module.css";

interface BroadcastSettingsDialogProps {
  broadcast: Broadcast;
  onClose: () => void;
  onQualityChange: (quality: StreamQuality) => void;
  onAudioChange: (on: boolean) => void;
}

/** Quality and sound of the running broadcast; changes apply right away. */
export function BroadcastSettingsDialog({ broadcast, onClose, onQualityChange, onAudioChange }: BroadcastSettingsDialogProps) {
  const { t } = useI18n();
  return (
    <Dialog title={t.stage.settingsTitle} onClose={onClose}>
      <div className={styles.confirm}>
        <section className={styles.section} aria-labelledby="settings-quality">
          <h3 id="settings-quality" className="label">
            {t.picker.qualityLabel}
          </h3>
          <QualityPicker value={broadcast.quality} onChange={onQualityChange} />
        </section>
        {broadcast.hasAudio && (
          <Toggle label={t.quality.audioLabel} checked={broadcast.audioOn} onChange={onAudioChange} />
        )}
        {broadcast.qualityError && (
          <p className={screen.error} role="alert">
            {t.quality.applyFailed}
          </p>
        )}
      </div>
    </Dialog>
  );
}
