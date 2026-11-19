// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useMemo, useState } from "react";
import { applyQualityToTrack, videoProfileFor, type CaptureSource, type CaptureSourceKind } from "@relay/core";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { QualityPicker } from "../components/QualityPicker";
import { Segmented } from "../components/Segmented";
import { Toggle } from "../components/Toggle";
import { BackIcon, RefreshIcon } from "../components/icons";
import { useBroadcastAudio } from "../hooks/useBroadcastAudio";
import { useStreamQuality } from "../hooks/useStreamQuality";
import { useI18n } from "../i18n/I18nContext";
import { usePlatform } from "../platform/PlatformContext";
import type { StartedBroadcast } from "../session/useBroadcast";
import screen from "../screens/Screen.module.css";
import styles from "./GoLiveDialog.module.css";

interface GoLiveDialogProps {
  onClose: () => void;
  /** The capture is up; the dialog stays open (busy) until the caller closes it. */
  onStarted: (broadcast: StartedBroadcast) => void;
  /**
   * "switch": picking a new source for a live broadcast. The sound choice
   * is fixed by the broadcast (`audio`), so its toggle is hidden, and the
   * buttons read as switching rather than starting.
   */
  mode?: "start" | "switch";
  /** With mode "switch": capture sound with the new source or not. */
  audio?: boolean;
}

type LoadState = { status: "loading" } | { status: "ready"; sources: CaptureSource[] } | { status: "failed" };

/**
 * Going live, in two steps: pick a monitor or window from the thumbnails,
 * then confirm what's being broadcast (with a way back to change it), the
 * sound, and the quality.
 */
export function GoLiveDialog({ onClose, onStarted, mode = "start", audio: fixedAudio }: GoLiveDialogProps) {
  const switching = mode === "switch";
  const { t } = useI18n();
  const platform = usePlatform();
  const [step, setStep] = useState<"source" | "confirm">("source");
  const [kind, setKind] = useState<CaptureSourceKind>("screen");
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [selected, setSelected] = useState<CaptureSource | null>(null);
  const [quality, setQuality] = useStreamQuality();
  const [savedAudio, setAudio] = useBroadcastAudio();
  const audio = switching ? (fixedAudio ?? false) : savedAudio;
  const canSendAudio = platform.capabilities.systemAudio;
  const [starting, setStarting] = useState(false);
  const [captureError, setCaptureError] = useState(false);

  const fetchSources = useCallback(async (): Promise<LoadState> => {
    try {
      return { status: "ready", sources: (await platform.listSources?.()) ?? [] };
    } catch (error) {
      console.error("Failed to list capture sources", error);
      return { status: "failed" };
    }
  }, [platform]);

  // Initial state is already "loading", so the first fetch needs no reset.
  useEffect(() => {
    let cancelled = false;
    void fetchSources().then((next) => {
      if (!cancelled) setLoad(next);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchSources]);

  function refresh() {
    setLoad({ status: "loading" });
    void fetchSources().then(setLoad);
  }

  // Monitors get stable, translated names ("Monitor 1", "Monitor 2") in the
  // order the OS reports them; the raw names are inconsistent per machine.
  const visible = useMemo(() => {
    if (load.status !== "ready") return [];
    const ofKind = load.sources.filter((source) => source.kind === kind);
    return kind === "screen"
      ? ofKind.map((source, index) => ({ ...source, name: t.picker.monitorName(index + 1) }))
      : ofKind;
  }, [load, kind, t]);

  function choose(source: CaptureSource) {
    setSelected(source);
    setCaptureError(false);
    setStep("confirm");
  }

  async function start() {
    if (!selected || !platform.captureSource) return;
    setStarting(true);
    setCaptureError(false);
    try {
      const { contentHint } = videoProfileFor(quality);
      const stream = await platform.captureSource(selected.id, { contentHint, audio: canSendAudio && audio });
      const [track] = stream.getVideoTracks();
      if (track) {
        // A failed constraint (odd source) still leaves a working stream.
        await applyQualityToTrack(track, quality).catch((error) => console.warn("Couldn't apply quality", error));
      }
      onStarted({ stream, sourceName: selected.name, quality });
    } catch (error) {
      console.error("Failed to capture source", error);
      setCaptureError(true);
      setStarting(false);
    }
  }

  const title = switching ? t.picker.switchTitle : t.picker.title;

  if (step === "confirm" && selected) {
    return (
      <Dialog
        title={title}
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStep("source")} disabled={starting}>
              <BackIcon /> {t.picker.back}
            </Button>
            <span className={styles.footerSpacer} />
            <Button variant="primary" disabled={starting} onClick={() => void start()}>
              {switching
                ? starting
                  ? t.picker.switching
                  : t.picker.switchTo
                : starting
                  ? t.picker.starting
                  : t.picker.start}
            </Button>
          </>
        }
      >
        <div className={styles.confirm}>
          <section className={styles.section} aria-labelledby="golive-streaming">
            <h3 id="golive-streaming" className="label">
              {t.picker.streamingLabel}
            </h3>
            <div className={styles.chosen}>
              <img className={styles.chosenThumb} src={selected.thumbnail} alt="" />
              {selected.icon && <img className={styles.appIcon} src={selected.icon} alt="" />}
              <span className={styles.chosenName} title={selected.name}>
                {selected.name}
              </span>
              <Button variant="secondary" onClick={() => setStep("source")} disabled={starting}>
                {t.picker.change}
              </Button>
            </div>
          </section>

          {canSendAudio && !switching && (
            <Toggle
              label={t.quality.audioLabel}
              description={t.quality.audioDescription}
              checked={audio}
              onChange={setAudio}
            />
          )}

          <section className={styles.section} aria-labelledby="golive-quality">
            <h3 id="golive-quality" className="label">
              {t.picker.qualityLabel}
            </h3>
            <QualityPicker value={quality} onChange={setQuality} />
          </section>

          {captureError && (
            <p className={screen.error} role="alert">
              {t.picker.captureFailed}
            </p>
          )}
        </div>
      </Dialog>
    );
  }

  const emptyText = kind === "screen" ? t.picker.emptyScreens : t.picker.emptyWindows;

  return (
    <Dialog
      title={title}
      size="wide"
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t.picker.cancel}
        </Button>
      }
    >
      <div className={styles.toolbar}>
        <Segmented
          label={t.picker.sourceLabel}
          value={kind}
          onChange={setKind}
          options={[
            { value: "screen", label: t.picker.screens },
            { value: "window", label: t.picker.windows },
          ]}
        />
        <Button variant="ghost" onClick={refresh} aria-label={t.picker.refresh} title={t.picker.refresh}>
          <RefreshIcon />
          <span className={styles.refreshText}>{t.picker.refresh}</span>
        </Button>
      </div>

      {load.status === "loading" && <p className={screen.description}>{t.picker.loading}</p>}
      {load.status === "failed" && (
        <p className={screen.error} role="alert">
          {t.picker.loadFailed}
        </p>
      )}
      {load.status === "ready" && visible.length === 0 && <p className={screen.description}>{emptyText}</p>}
      {visible.length > 0 && (
        <ul className={styles.grid} aria-label={t.picker.sourceLabel}>
          {visible.map((source) => {
            const current = source.id === selected?.id;
            return (
              <li key={source.id} className={styles.cell}>
                <button type="button" className={styles.card} data-current={current} onClick={() => choose(source)}>
                  <span className={screen.bezel}>
                    <img className={screen.screenArea} src={source.thumbnail} alt="" />
                  </span>
                  <span className={styles.chin}>
                    {source.icon && <img className={styles.appIcon} src={source.icon} alt="" />}
                    <span className={styles.name} title={source.name}>
                      {source.name}
                    </span>
                    <span className="lamp" data-lit={current} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
