// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CaptureSource } from "@relay/core";
import { PlatformContext } from "../platform/PlatformContext";
import { fakePlatform } from "../test/fakePlatform";
import { SourcePicker } from "./SourcePicker";

const SOURCES: CaptureSource[] = [
  { id: "screen:1:0", kind: "screen", name: "Screen 1", thumbnail: "data:," },
  { id: "screen:2:0", kind: "screen", name: "Entire screen", thumbnail: "data:," },
  { id: "window:42:0", kind: "window", name: "Notepad", thumbnail: "data:," },
];

function renderPicker(captureSource = vi.fn(async () => new MediaStream())) {
  const onStarted = vi.fn();
  const platform = fakePlatform({ listSources: async () => SOURCES, captureSource });
  render(
    <PlatformContext.Provider value={platform}>
      <SourcePicker onBack={() => {}} onStarted={onStarted} />
    </PlatformContext.Provider>,
  );
  return { onStarted, captureSource };
}

beforeAll(() => {
  // jsdom has no MediaStream; the picker only passes it through.
  globalThis.MediaStream ??= class {} as unknown as typeof MediaStream;
});

describe("SourcePicker", () => {
  it("names monitors by position, regardless of the OS's raw names", async () => {
    renderPicker();
    expect(await screen.findByRole("radio", { name: "Monitor 1" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Monitor 2" })).toBeInTheDocument();
    expect(screen.queryByText("Notepad")).not.toBeInTheDocument();
  });

  it("switches to windows and clears the selection", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(await screen.findByRole("radio", { name: "Monitor 1" }));
    await user.click(screen.getByRole("radio", { name: "Windows" }));
    expect(screen.getByRole("radio", { name: "Notepad" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "Start broadcast" })).toBeDisabled();
  });

  it("captures the selected source with the chosen quality", async () => {
    const user = userEvent.setup();
    const { onStarted, captureSource } = renderPicker();
    expect(screen.getByRole("button", { name: "Start broadcast" })).toBeDisabled();
    await user.click(await screen.findByRole("radio", { name: "Monitor 2" }));
    await user.click(screen.getByRole("radio", { name: /Smoothness/ }));
    await user.click(screen.getByRole("button", { name: "Start broadcast" }));
    expect(captureSource).toHaveBeenCalledWith("screen:2:0", { contentHint: "motion", frameRate: { ideal: 60, max: 60 } });
    expect(onStarted).toHaveBeenCalledWith(expect.objectContaining({ sourceName: "Monitor 2", contentHint: "motion" }));
  });

  it("shows an error and stays put when capture fails", async () => {
    const user = userEvent.setup();
    const failing = vi.fn(async () => {
      throw new Error("denied");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { onStarted } = renderPicker(failing);
    await user.click(await screen.findByRole("radio", { name: "Monitor 1" }));
    await user.click(screen.getByRole("button", { name: "Start broadcast" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't capture this source");
    expect(onStarted).not.toHaveBeenCalled();
  });
});
