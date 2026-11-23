// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Platform } from "@relay/core";
import { PlatformContext } from "../platform/PlatformContext";
import { fakePlatform } from "../test/fakePlatform";
import { SettingsDialog } from "./SettingsDialog";

function renderSettings(overrides: Partial<Platform>) {
  render(
    <PlatformContext.Provider value={fakePlatform({ appVersion: "0.2.0", ...overrides })}>
      <SettingsDialog onClose={() => {}} />
    </PlatformContext.Provider>,
  );
}

describe("SettingsDialog", () => {
  it("shows the version and opens the log folder", async () => {
    const user = userEvent.setup();
    const openLogFolder = vi.fn(async () => {});
    renderSettings({ openLogFolder });
    expect(screen.getByText("Relay 0.2.0")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open log folder" }));
    expect(openLogFolder).toHaveBeenCalled();
  });

  it("says so when the folder can't be opened", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderSettings({ openLogFolder: async () => Promise.reject(new Error("nope")) });
    await user.click(screen.getByRole("button", { name: "Open log folder" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't open the log folder.");
  });

  it("has no log section where the shell keeps no log", () => {
    renderSettings({});
    expect(screen.queryByText("Logs")).not.toBeInTheDocument();
  });
});
