// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useMemo, useState } from "react";
import { videoProfileFor, type CaptureSource, type CaptureSourceKind, type ContentHint } from "@relay/core";
import { Button } from "../components/Button";
import { Segmented } from "../components/Segmented";
import { BackIcon, RefreshIcon } from "../components/icons";
import { useI18n } from "../i18n/I18nContext";
import { usePlatform } from "../platform/PlatformContext";
import { handleRadioGroupKeyDown } from "../radioGroupNav";
import screen from "./Screen.module.css";
import styles from "./SourcePicker.module.css";

export interface StartedBroadcast {
  stream: MediaStream;
  sourceName: string;
  contentHint: ContentHint;
}

interface SourcePickerProps {
  notice?: string;
  onBack: () => void;
  onStarted: (broadcast: StartedBroadcast) => void;
}

type LoadState = { status: "loading" } | { status: "ready"; sources: CaptureSource[] } | { status: "failed" };

export function SourcePicker({ notice, onBack, onStarted }: SourcePickerProps) {
  const { t } = useI18n();
  const platform = usePlatform();
  const [kind, setKind] = useState<CaptureSourceKind>("screen");
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contentHint, setContentHint] = useState<ContentHint>("detail");
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

  const selected = visible.find((source) => source.id === selectedId) ?? null;

  async function start() {
    if (!selected || !platform.captureSource) return;
    setStarting(true);
    setCaptureError(false);
    try {
      const { frameRate } = videoProfileFor(contentHint);
      const stream = await platform.captureSource(selected.id, { contentHint, frameRate });
      onStarted({ stream, sourceName: selected.name, contentHint });
    } catch (error) {
      console.error("Failed to capture source", error);
      setCaptureError(true);
      setStarting(false);
    }
  }

  const emptyText = kind === "screen" ? t.picker.emptyScreens : t.picker.emptyWindows;

  return (
    <div className={screen.screen}>
      {notice && (
        <p className={screen.note} role="status">
          {notice}
        </p>
      )}

      <section className={screen.panel} aria-labelledby="picker-source">
        <div className={screen.panelHead}>
          <h2 id="picker-source" className="label">
            {t.picker.sourceLabel}
          </h2>
          <div className={styles.toolbar}>
            <Segmented
              label={t.picker.sourceLabel}
              value={kind}
              onChange={(next) => {
                setKind(next);
                setSelectedId(null);
              }}
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
        </div>

        {load.status === "loading" && <p className={screen.description}>{t.picker.loading}</p>}
        {load.status === "failed" && (
          <p className={screen.error} role="alert">
            {t.picker.loadFailed}
          </p>
        )}
        {load.status === "ready" && visible.length === 0 && <p className={screen.description}>{emptyText}</p>}
        {visible.length > 0 && (
          <div
            role="radiogroup"
            aria-labelledby="picker-source"
            className={styles.grid}
            onKeyDown={handleRadioGroupKeyDown}
          >
            {visible.map((source, index) => {
              const checked = source.id === selectedId;
              // Roving tabIndex: the checked card, or the first one when
              // nothing is picked yet, is the group's single Tab stop.
              const tabbable = checked || (selectedId === null && index === 0);
              return (
                <button
                  key={source.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  tabIndex={tabbable ? 0 : -1}
                  className={styles.card}
                  onClick={() => setSelectedId(source.id)}
                >
                  <span className={screen.bezel}>
                    <img className={screen.screenArea} src={source.thumbnail} alt="" />
                  </span>
                  <span className={styles.chin}>
                    {source.icon && <img className={styles.appIcon} src={source.icon} alt="" />}
                    <span className={styles.name} title={source.name}>
                      {source.name}
                    </span>
                    <span className="lamp" data-lit={checked} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className={screen.panel} aria-labelledby="picker-quality">
        <h2 id="picker-quality" className="label">
          {t.picker.qualityLabel}
        </h2>
        <Segmented
          label={t.picker.qualityLabel}
          value={contentHint}
          onChange={setContentHint}
          options={[
            { value: "detail", label: t.picker.qualityDetail, hint: t.picker.qualityDetailHint },
            { value: "motion", label: t.picker.qualityMotion, hint: t.picker.qualityMotionHint },
          ]}
        />
      </section>

      {captureError && (
        <p className={screen.error} role="alert">
          {t.picker.captureFailed}
        </p>
      )}

      <div className={screen.actions}>
        <Button variant="ghost" onClick={onBack}>
          <BackIcon /> {t.picker.back}
        </Button>
        <Button variant="primary" disabled={!selected || starting} onClick={() => void start()}>
          {starting ? t.picker.starting : t.picker.start}
        </Button>
      </div>
    </div>
  );
}
