// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CaptureSource, Platform } from "@relay/core";
import { PlatformContext } from "../platform/PlatformContext";
import { fakePlatform } from "../test/fakePlatform";
import { GoLiveDialog } from "./GoLiveDialog";

const SOURCES: CaptureSource[] = [
  { id: "screen:1:0", kind: "screen", name: "Screen 1", thumbnail: "data:," },
  { id: "screen:2:0", kind: "screen", name: "Entire screen", thumbnail: "data:," },
  { id: "window:42:0", kind: "window", name: "Notepad", thumbnail: "data:," },
];

const applied = vi.fn(async () => {});
const fakeStream = () =>
  ({ getVideoTracks: () => [{ contentHint: "", applyConstraints: applied }] }) as unknown as MediaStream;

function renderDialog(overrides: Partial<Platform> = {}, mode: "start" | "switch" = "start") {
  const onStarted = vi.fn();
  const captureSource = vi.fn(async () => fakeStream());
  const platform = fakePlatform({ listSources: async () => SOURCES, captureSource, ...overrides });
  render(
    <PlatformContext.Provider value={platform}>
      <GoLiveDialog onClose={() => {}} onStarted={onStarted} mode={mode} />
    </PlatformContext.Provider>,
  );
  return { onStarted, captureSource };
}

const withAudio = { capabilities: { host: true, systemAudio: true, floating: "window", selfUpdate: false } } as const;

describe("GoLiveDialog", () => {
  it("names monitors by position, and lists windows on their tab", async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(await screen.findByRole("button", { name: /Monitor 1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Monitor 2/ })).toBeInTheDocument();
    expect(screen.queryByText("Notepad")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Windows" }));
    expect(screen.getByRole("button", { name: /Notepad/ })).toBeInTheDocument();
  });

  it("captures the chosen source with the chosen quality", async () => {
    const user = userEvent.setup();
    const { onStarted, captureSource } = renderDialog();
    await user.click(await screen.findByRole("button", { name: /Monitor 2/ }));
    await user.click(screen.getByRole("radio", { name: "720p" }));
    await user.click(screen.getByRole("radio", { name: /30 FPS/ }));
    await user.click(screen.getByRole("button", { name: "Go live" }));
    expect(captureSource).toHaveBeenCalledWith("screen:2:0", { contentHint: "detail", audio: false });
    expect(applied).toHaveBeenCalledWith(expect.objectContaining({ frameRate: { ideal: 30, max: 30 }, height: { max: 720 } }));
    expect(onStarted).toHaveBeenCalledWith(
      expect.objectContaining({ sourceName: "Monitor 2", quality: { resolution: "720", fps: 30 } }),
    );
  });

  it("asks for system audio when the platform has it and the switch is on", async () => {
    const user = userEvent.setup();
    const { captureSource } = renderDialog(withAudio);
    await user.click(await screen.findByRole("button", { name: /Monitor 1/ }));
    expect(screen.getByRole("switch", { name: /Send sound/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Go live" }));
    expect(captureSource).toHaveBeenLastCalledWith("screen:1:0", expect.objectContaining({ audio: true }));
  });

  it("hides the sound switch where the platform can't send audio", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByRole("button", { name: /Monitor 1/ }));
    expect(screen.queryByRole("switch", { name: /Send sound/ })).not.toBeInTheDocument();
  });

  it("reads as switching in switch mode, without the sound switch", async () => {
    const user = userEvent.setup();
    renderDialog(withAudio, "switch");
    expect(screen.getByRole("dialog", { name: "Change source" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Monitor 1/ }));
    expect(screen.queryByRole("switch", { name: /Send sound/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Broadcast this source" })).toBeInTheDocument();
  });
});
