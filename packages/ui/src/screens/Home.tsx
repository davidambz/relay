// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { Button } from "../components/Button";
import { BroadcastIcon, WatchIcon } from "../components/icons";
import { useI18n } from "../i18n/I18nContext";
import { usePlatform } from "../platform/PlatformContext";
import { UpdatesPanel } from "../components/UpdatesPanel";
import screen from "./Screen.module.css";
import styles from "./Home.module.css";

interface HomeProps {
  onBroadcast: () => void;
  onWatch: () => void;
  /** Why the last session ended, if it did. */
  notice?: string;
}

/** Shown while nothing is running: broadcast or watch. */
export function Home({ onBroadcast, onWatch, notice }: HomeProps) {
  const { t } = useI18n();
  const platform = usePlatform();

  return (
    <div className={screen.screen}>
      {notice && (
        <p className={screen.note} role="status">
          {notice}
        </p>
      )}
      <div className={styles.bays}>
        {platform.capabilities.host && (
          <section className={[screen.panel, styles.bay].join(" ")} aria-labelledby="home-broadcast">
            <span className={[styles.badge, "label"].join(" ")}>
              <BroadcastIcon /> {t.home.broadcastLabel}
            </span>
            <h2 id="home-broadcast" className={screen.title}>
              {t.home.broadcastTitle}
            </h2>
            <p className={screen.description}>{t.home.broadcastDescription}</p>
            <Button variant="primary" onClick={onBroadcast} className={styles.cta}>
              {t.home.broadcastButton}
            </Button>
          </section>
        )}
        <section className={[screen.panel, styles.bay].join(" ")} aria-labelledby="home-watch">
          <span className={[styles.badge, "label"].join(" ")}>
            <WatchIcon /> {t.home.watchLabel}
          </span>
          <h2 id="home-watch" className={screen.title}>
            {t.home.watchTitle}
          </h2>
          <p className={screen.description}>{t.home.watchDescription}</p>
          <Button variant={platform.capabilities.host ? "secondary" : "primary"} onClick={onWatch} className={styles.cta}>
            {t.home.watchButton}
          </Button>
        </section>
      </div>
      <UpdatesPanel />
    </div>
  );
}
