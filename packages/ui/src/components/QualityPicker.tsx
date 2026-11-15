// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { STREAM_FPS, STREAM_RESOLUTIONS, type StreamQuality, type StreamResolution } from "@relay/core";
import { useI18n } from "../i18n/I18nContext";
import { Segmented } from "./Segmented";
import styles from "./QualityPicker.module.css";

interface QualityPickerProps {
  value: StreamQuality;
  onChange: (quality: StreamQuality) => void;
}

/** Resolution cap and frame rate, as two rocker banks. */
export function QualityPicker({ value, onChange }: QualityPickerProps) {
  const { t } = useI18n();
  const resolutionLabel = (resolution: StreamResolution) =>
    resolution === "native" ? t.quality.native : `${resolution}p`;

  return (
    <div className={styles.picker}>
      <div className={styles.row}>
        <span className="label">{t.quality.resolutionLabel}</span>
        <Segmented
          label={t.quality.resolutionLabel}
          value={value.resolution}
          onChange={(resolution) => onChange({ ...value, resolution })}
          options={STREAM_RESOLUTIONS.map((resolution) => ({ value: resolution, label: resolutionLabel(resolution) }))}
        />
      </div>
      <div className={styles.row}>
        <span className="label">{t.quality.fpsLabel}</span>
        <Segmented
          label={t.quality.fpsLabel}
          value={String(value.fps) as "30" | "60"}
          onChange={(fps) => onChange({ ...value, fps: Number(fps) as StreamQuality["fps"] })}
          options={STREAM_FPS.map((fps) => ({
            value: String(fps) as "30" | "60",
            label: `${fps} FPS`,
            hint: fps === 60 ? t.quality.fps60Hint : t.quality.fps30Hint,
          }))}
        />
      </div>
    </div>
  );
}
