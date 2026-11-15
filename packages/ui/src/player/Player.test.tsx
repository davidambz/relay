// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { act, fireEvent, render, screen } from "@testing-library/react";
import { PlatformContext } from "../platform/PlatformContext";
import { fakePlatform } from "../test/fakePlatform";
import { AUTO_HIDE_MS } from "./useAutoHide";
import { Player } from "./Player";
import { useVolume } from "./useVolume";

function PlayerWithAudio(props: { onLeave: () => void; onFloatingWindow?: () => void }) {
  const audio = useVolume();
  return <Player stream={null} code="ABC234" placeholder="Connecting…" audio={audio} {...props} />;
}

function renderPlayer(storage = new Map<string, unknown>(), onFloatingWindow?: () => void) {
  const platform = fakePlatform({
    storage: {
      get: async <T,>(key: string) => storage.get(key) as T | undefined,
      set: async (key, value) => void storage.set(key, value),
    },
  });
  const onLeave = vi.fn();
  const utils = render(
    <PlatformContext.Provider value={platform}>
      <PlayerWithAudio onLeave={onLeave} onFloatingWindow={onFloatingWindow} />
      <input aria-label="elsewhere" />
    </PlatformContext.Provider>,
  );
  const player = utils.container.querySelector("[data-chrome]") as HTMLElement;
  return { ...utils, player, onLeave, storage };
}

describe("Player", () => {
  afterEach(() => vi.useRealTimers());

  it("hides the chrome after the pointer rests and brings it back on movement", () => {
    vi.useFakeTimers();
    const { player } = renderPlayer();
    expect(player.dataset.chrome).toBe("shown");
    act(() => vi.advanceTimersByTime(AUTO_HIDE_MS));
    expect(player.dataset.chrome).toBe("hidden");
    fireEvent.pointerMove(player);
    expect(player.dataset.chrome).toBe("shown");
  });

  it("keeps the chrome up while the pointer is over the controls", () => {
    vi.useFakeTimers();
    const { player } = renderPlayer();
    fireEvent.pointerEnter(screen.getByRole("button", { name: /Leave/ }).parentElement!);
    act(() => vi.advanceTimersByTime(AUTO_HIDE_MS * 3));
    expect(player.dataset.chrome).toBe("shown");
  });

  it("toggles mute with M and remembers it", async () => {
    const { storage } = renderPlayer();
    fireEvent.keyDown(window, { key: "m" });
    expect(screen.getByRole("button", { name: "Unmute (M)" })).toHaveAttribute("aria-pressed", "true");
    expect(storage.get("player.muted")).toBe(true);
    fireEvent.keyDown(window, { key: "M" });
    expect(screen.getByRole("button", { name: "Mute (M)" })).toHaveAttribute("aria-pressed", "false");
  });

  it("ignores shortcuts while typing in a text field", () => {
    renderPlayer();
    const input = screen.getByLabelText("elsewhere");
    fireEvent.keyDown(input, { key: "m" });
    expect(screen.getByRole("button", { name: "Mute (M)" })).toBeInTheDocument();
  });

  it("requests fullscreen on the container with F, the button and double-click", () => {
    const request = vi.fn(async () => {});
    HTMLElement.prototype.requestFullscreen = request;
    const { player } = renderPlayer();
    fireEvent.keyDown(window, { key: "f" });
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen (F)" }));
    fireEvent.doubleClick(player.querySelector("video")!);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.contexts[0]).toBe(player);
  });

  it("restores the saved volume and unmutes when the slider is raised", async () => {
    const storage = new Map<string, unknown>([
      ["player.volume", 0.4],
      ["player.muted", true],
    ]);
    renderPlayer(storage);
    const slider = (await screen.findByRole("slider", { name: "Volume" })) as HTMLInputElement;
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Unmute (M)" })).toBeInTheDocument());
    expect(slider.value).toBe("0");
    fireEvent.change(slider, { target: { value: "0.6" } });
    expect(storage.get("player.volume")).toBe(0.6);
    expect(storage.get("player.muted")).toBe(false);
    expect(screen.getByRole("button", { name: "Mute (M)" })).toBeInTheDocument();
  });

  it("opens the mini player with its button and P", () => {
    const onFloatingWindow = vi.fn();
    renderPlayer(undefined, onFloatingWindow);
    fireEvent.click(screen.getByRole("button", { name: "Mini player (P)" }));
    fireEvent.keyDown(window, { key: "p" });
    expect(onFloatingWindow).toHaveBeenCalledTimes(2);
  });

  it("has no mini player button when the shell can't float", () => {
    renderPlayer();
    expect(screen.queryByRole("button", { name: "Mini player (P)" })).not.toBeInTheDocument();
  });

  it("calls onLeave from the Leave control", () => {
    const { onLeave } = renderPlayer();
    fireEvent.click(screen.getByRole("button", { name: /Leave/ }));
    expect(onLeave).toHaveBeenCalled();
  });
});
