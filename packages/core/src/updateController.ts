// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { LogFn } from "./log";
import type { UpdateStatus, UpdatesApi } from "./platform";
import { evaluateRelease, type ReleaseAssetKind, type UpdateCheck } from "./updates";

// When to look for, fetch and install updates, for shells that keep the
// installer themselves (Android). The shell supplies the I/O; the rules
// are here so they're tested once:
//
// - look on start (after a short delay), then every 24 h;
// - fetch the new version in the background, never during a session,
//   and not on a metered connection (mobile data) unless asked to;
// - install only when the person asks, and never during a session.

export const UPDATE_STARTUP_DELAY_MS = 8000;
export const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface UpdateDeps {
  appVersion: string;
  repo: string;
  asset: ReleaseAssetKind;
  /** GitHub's "latest release" JSON, or null for 404 (no release yet). */
  fetchLatestRelease(): Promise<unknown>;
  isMetered(): Promise<boolean>;
  isDownloaded(version: string): Promise<boolean>;
  download(check: Extract<UpdateCheck, { status: "available" }>): Promise<void>;
  install(version: string): Promise<void>;
  log?: LogFn;
}

export class UpdateController implements UpdatesApi {
  private status: UpdateStatus = { state: "idle" };
  private lastCheck: UpdateCheck | null = null;
  private downloading: Promise<void> | null = null;
  private sessionActive = false;
  private lastCheckAt = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private readonly listeners = new Set<(status: UpdateStatus) => void>();
  private readonly deps: UpdateDeps;

  constructor(deps: UpdateDeps) {
    this.deps = deps;
  }

  private setStatus(next: UpdateStatus) {
    this.status = next;
    for (const listener of this.listeners) listener(next);
  }

  private log(level: "info" | "warn", message: string, data?: Record<string, string | number | boolean | undefined>) {
    this.deps.log?.({ level, scope: "updates", message, data });
  }

  async getStatus() {
    return this.status;
  }

  onStatus(listener: (status: UpdateStatus) => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** Checks on start (after a delay), then daily; call when the app comes back to the foreground too. */
  start() {
    this.timers.push(setTimeout(() => void this.check(), UPDATE_STARTUP_DELAY_MS));
    this.timers.push(setInterval(() => void this.check(), UPDATE_INTERVAL_MS));
  }

  stop() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  /** Back in the foreground: check if the last check is a day old. */
  resumed() {
    if (Date.now() - this.lastCheckAt >= UPDATE_INTERVAL_MS) void this.check();
  }

  setSessionActive(active: boolean) {
    if (active === this.sessionActive) return;
    this.sessionActive = active;
    // A download held back by the session can go now.
    if (!active) void this.downloadInBackground();
  }

  async check(): Promise<void> {
    if (this.status.state === "checking" || this.status.state === "installing") return;
    const previous = this.status;
    this.setStatus({ state: "checking" });
    this.lastCheckAt = Date.now();
    let check: UpdateCheck;
    try {
      const release = await this.deps.fetchLatestRelease();
      check = release === null ? { status: "up-to-date" } : evaluateRelease(this.deps.appVersion, release, this.deps.repo, this.deps.asset);
    } catch (error) {
      check = { status: "failed", reason: error instanceof Error ? error.message : String(error) };
    }
    this.lastCheck = check;
    if (check.status === "failed") {
      this.log("warn", "Check failed", { reason: check.reason });
      // A failed check doesn't forget an update already found.
      this.setStatus(previous.state === "ready" || previous.state === "available" ? previous : { state: "failed", reason: check.reason });
      return;
    }
    this.log("info", "Checked", { status: check.status, latest: check.latestVersion });
    if (check.status === "up-to-date") {
      this.setStatus({ state: "up-to-date" });
      return;
    }
    const ready = await this.deps.isDownloaded(check.latestVersion).catch(() => false);
    this.setStatus({ state: ready ? "ready" : "available", latestVersion: check.latestVersion });
    if (!ready) await this.downloadInBackground();
  }

  /** Fetches the available update unless a session runs or the connection is metered. */
  private async downloadInBackground() {
    if (this.status.state !== "available" || this.sessionActive) return;
    if (await this.deps.isMetered().catch(() => true)) {
      this.log("info", "Waiting for a connection that isn't metered");
      return;
    }
    await this.fetchUpdate().catch(() => {});
  }

  private fetchUpdate(): Promise<void> {
    const check = this.lastCheck;
    if (check?.status !== "available") return Promise.reject(new Error("No update to fetch"));
    this.downloading ??= (async () => {
      const { latestVersion } = check;
      this.setStatus({ state: "downloading", latestVersion });
      try {
        await this.deps.download(check);
        this.log("info", "Downloaded", { version: latestVersion });
        this.setStatus({ state: "ready", latestVersion });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.log("warn", "Download failed", { reason });
        this.setStatus({ state: "available", latestVersion });
        throw error;
      } finally {
        this.downloading = null;
      }
    })();
    return this.downloading;
  }

  /** Fetches (even on mobile data: the person asked) and installs. */
  async apply(): Promise<void> {
    if (this.sessionActive) throw new Error("Not while broadcasting or watching");
    const check = this.lastCheck;
    if (check?.status !== "available") throw new Error("No update to apply");
    if (this.status.state !== "ready") await this.fetchUpdate();
    this.setStatus({ state: "installing", latestVersion: check.latestVersion });
    this.log("info", "Installing", { version: check.latestVersion });
    try {
      await this.deps.install(check.latestVersion);
    } catch (error) {
      this.installFailed(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /** The system's installer gave up (or the person cancelled): offer it again. */
  installFailed(reason: string) {
    const check = this.lastCheck;
    this.log("warn", "Install failed", { reason });
    if (check?.status === "available") this.setStatus({ state: "ready", latestVersion: check.latestVersion });
  }
}
