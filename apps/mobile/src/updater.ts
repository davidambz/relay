// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { ANDROID_APK, UpdateController } from "@relay/core";

// Native side: android/app/src/main/java/com/davidambz/relay/UpdaterPlugin.java.
interface RelayUpdaterPlugin {
  isMetered(): Promise<{ metered: boolean }>;
  isDownloaded(options: { version: string }): Promise<{ downloaded: boolean }>;
  /** Downloads and checks the APK (checksum, package, newer, same signing key). */
  download(options: { url: string; version: string; sha256?: string }): Promise<void>;
  /** Hands it to the system installer; Relay restarts into the new version. */
  install(options: { version: string }): Promise<void>;
  addListener(
    event: "installStatus",
    listener: (state: { status: "confirming" | "installed" | "failed"; message?: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const RelayUpdater = registerPlugin<RelayUpdaterPlugin>("RelayUpdater");

const REPO = "davidambz/relay";

/** Self-update from GitHub Releases (Relay-X.Y.Z.apk), with the rules in UpdateController. */
export function createMobileUpdates(appVersion: string): UpdateController {
  const updates = new UpdateController({
    appVersion,
    repo: REPO,
    asset: ANDROID_APK,
    async fetchLatestRelease() {
      const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
      return response.json();
    },
    isMetered: async () => (await RelayUpdater.isMetered()).metered,
    isDownloaded: async (version) => (await RelayUpdater.isDownloaded({ version })).downloaded,
    download: (check) => RelayUpdater.download({ url: check.downloadUrl, version: check.latestVersion, sha256: check.sha256 }),
    install: (version) => RelayUpdater.install({ version }),
  });
  void RelayUpdater.addListener("installStatus", (state) => {
    if (state.status === "failed") updates.installFailed(state.message ?? "failed");
  });
  return updates;
}
