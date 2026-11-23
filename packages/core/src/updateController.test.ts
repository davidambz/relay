// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { UpdateStatus } from "./platform";
import { UPDATE_INTERVAL_MS, UPDATE_STARTUP_DELAY_MS, UpdateController, type UpdateDeps } from "./updateController";
import { ANDROID_APK } from "./updates";

const REPO = "davidambz/relay";
const release = (version: string) => ({
  tag_name: `v${version}`,
  assets: [{ name: `Relay-${version}.apk`, browser_download_url: `https://github.com/${REPO}/releases/download/v${version}/Relay-${version}.apk` }],
});

function setup(overrides: Partial<UpdateDeps> = {}) {
  const downloaded = new Set<string>();
  const deps = {
    appVersion: "0.1.0",
    repo: REPO,
    asset: ANDROID_APK,
    fetchLatestRelease: vi.fn(async () => release("0.2.0")),
    isMetered: vi.fn(async () => false),
    isDownloaded: vi.fn(async (version: string) => downloaded.has(version)),
    download: vi.fn(async (check: { latestVersion: string }) => void downloaded.add(check.latestVersion)),
    install: vi.fn(async () => {}),
    ...overrides,
  } satisfies UpdateDeps;
  const updates = new UpdateController(deps);
  const states: UpdateStatus["state"][] = [];
  updates.onStatus((status) => states.push(status.state));
  return { updates, deps, states, downloaded };
}

describe("UpdateController", () => {
  it("fetches a new version in the background and waits for the person to install", async () => {
    const { updates, deps, states } = setup();
    await updates.check();
    expect(states).toEqual(["checking", "available", "downloading", "ready"]);
    expect(deps.install).not.toHaveBeenCalled();
    await updates.apply();
    expect(deps.install).toHaveBeenCalledWith("0.2.0");
    expect(await updates.getStatus()).toEqual({ state: "installing", latestVersion: "0.2.0" });
  });

  it("never downloads during a session, and does once it's over", async () => {
    const { updates, deps } = setup();
    updates.setSessionActive(true);
    await updates.check();
    expect(deps.download).not.toHaveBeenCalled();
    expect((await updates.getStatus()).state).toBe("available");
    await expect(updates.apply()).rejects.toThrow();
    updates.setSessionActive(false);
    await vi.waitFor(() => expect(deps.download).toHaveBeenCalled());
    await vi.waitFor(async () => expect((await updates.getStatus()).state).toBe("ready"));
  });

  it("waits for a connection that isn't metered, unless asked", async () => {
    const { updates, deps } = setup({ isMetered: vi.fn(async () => true) });
    await updates.check();
    expect(deps.download).not.toHaveBeenCalled();
    await updates.apply();
    expect(deps.download).toHaveBeenCalled();
    expect(deps.install).toHaveBeenCalled();
  });

  it("knows a version already downloaded", async () => {
    const { updates, deps, downloaded } = setup();
    downloaded.add("0.2.0");
    await updates.check();
    expect(deps.download).not.toHaveBeenCalled();
    expect((await updates.getStatus()).state).toBe("ready");
  });

  it("offers it again when the download or install fails", async () => {
    const { updates } = setup({ download: vi.fn(async () => Promise.reject(new Error("offline"))) });
    await updates.check();
    expect(await updates.getStatus()).toEqual({ state: "available", latestVersion: "0.2.0" });
    const ok = setup({ install: vi.fn(async () => Promise.reject(new Error("cancelled"))) });
    await ok.updates.check();
    await expect(ok.updates.apply()).rejects.toThrow("cancelled");
    expect((await ok.updates.getStatus()).state).toBe("ready");
  });

  it("is up to date with no newer release, or none at all", async () => {
    const same = setup({ fetchLatestRelease: vi.fn(async () => release("0.1.0")) });
    await same.updates.check();
    expect((await same.updates.getStatus()).state).toBe("up-to-date");
    const none = setup({ fetchLatestRelease: vi.fn(async () => null) });
    await none.updates.check();
    expect((await none.updates.getStatus()).state).toBe("up-to-date");
  });

  it("checks after start, then daily", async () => {
    vi.useFakeTimers();
    try {
      const { updates, deps } = setup();
      updates.start();
      await vi.advanceTimersByTimeAsync(UPDATE_STARTUP_DELAY_MS);
      expect(deps.fetchLatestRelease).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS);
      expect(deps.fetchLatestRelease).toHaveBeenCalledTimes(2);
      updates.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
