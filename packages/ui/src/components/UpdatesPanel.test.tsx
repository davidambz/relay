// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UpdateStatus, UpdatesApi } from "@relay/core";
import { PlatformContext } from "../platform/PlatformContext";
import { fakePlatform } from "../test/fakePlatform";
import { UpdatesPanel } from "./UpdatesPanel";

function setup(initial: UpdateStatus, selfUpdate = true) {
  let push: (status: UpdateStatus) => void = () => {};
  const updates: UpdatesApi = {
    getStatus: async () => initial,
    check: vi.fn(async () => {}),
    apply: vi.fn(async () => {}),
    onStatus: (listener) => {
      push = listener;
      return () => {};
    },
  };
  render(
    <PlatformContext.Provider
      value={fakePlatform({ appVersion: "0.3.0", updates, capabilities: { host: true, systemAudio: false, floating: "window", selfUpdate } })}
    >
      <UpdatesPanel />
    </PlatformContext.Provider>,
  );
  return { updates, push: (status: UpdateStatus) => act(() => push(status)) };
}

describe("UpdatesPanel", () => {
  it("shows the version and checks on demand", async () => {
    const user = userEvent.setup();
    const { updates } = setup({ state: "up-to-date" });
    expect(screen.getByText("Relay 0.3.0")).toBeInTheDocument();
    expect(await screen.findByText("You're on the latest version.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(updates.check).toHaveBeenCalled();
  });

  it("offers to update when a new version is available", async () => {
    const user = userEvent.setup();
    const { updates, push } = setup({ state: "idle" });
    push({ state: "available", latestVersion: "0.4.0" });
    expect(screen.getByText("Version 0.4.0 is available.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Update now" }));
    expect(updates.apply).toHaveBeenCalled();
  });

  it("disables checking while busy", () => {
    const { push } = setup({ state: "idle" });
    push({ state: "checking" });
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeDisabled();
  });

  it("only shows the version where the shell can't self-update", () => {
    setup({ state: "idle" }, false);
    expect(screen.getByText("Relay 0.3.0")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
