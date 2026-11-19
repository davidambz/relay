// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Platform } from "@relay/core";
import { I18nProvider } from "../i18n/I18nProvider";
import { PlatformContext } from "../platform/PlatformContext";
import { AUTO_HIDE_MS } from "../player/useAutoHide";
import { useVolumes } from "../player/useVolume";
import { fakePlatform } from "../test/fakePlatform";
import { Stage } from "./Stage";

const CODES = ["ABC234"];

interface Options {
  storage?: Map<string, unknown>;
  platform?: Partial<Platform>;
  pictureInPicture?: boolean;
}

function StageWithVolumes({ pictureInPicture, onLeave }: { pictureInPicture?: boolean; onLeave: (code: string) => void }) {
  const volumes = useVolumes(CODES);
  return (
    <Stage
      tiles={["ABC234"]}
      focus="ABC234"
      broadcast={null}
      viewers={{ ABC234: { status: "connecting" } }}
      volumes={volumes}
      onDismissNotice={() => {}}
      onFocus={() => {}}
      onLeave={onLeave}
      onStop={() => {}}
      onRetry={() => {}}
      onAddWatch={() => {}}
      onSwitchSource={() => {}}
      onSettings={() => {}}
      onAudioChange={() => {}}
      pictureInPicture={pictureInPicture}
    />
  );
}

function renderStage({ storage = new Map(), platform: overrides = {}, pictureInPicture = false }: Options = {}) {
  const platform = fakePlatform({
    storage: {
      get: async <T,>(key: string) => storage.get(key) as T | undefined,
      set: async (key, value) => void storage.set(key, value),
    },
    ...overrides,
  });
  const onLeave = vi.fn();
  const ui = (pip: boolean) => (
    <PlatformContext.Provider value={platform}>
      <I18nProvider>
        <StageWithVolumes pictureInPicture={pip} onLeave={onLeave} />
        <input aria-label="elsewhere" />
      </I18nProvider>
    </PlatformContext.Provider>
  );
  const utils = render(ui(pictureInPicture));
  const stage = utils.container.querySelector("[data-chrome]") as HTMLElement;
  return { ...utils, stage, onLeave, storage, rerenderPip: (pip: boolean) => utils.rerender(ui(pip)) };
}

describe("Stage", () => {
  afterEach(() => vi.useRealTimers());

  it("hides the controls after the pointer rests and brings them back on movement", async () => {
    const { stage } = renderStage();
    await screen.findByRole("toolbar");
    vi.useFakeTimers();
    fireEvent.pointerMove(stage);
    act(() => vi.advanceTimersByTime(AUTO_HIDE_MS));
    expect(stage.dataset.chrome).toBe("hidden");
    fireEvent.pointerMove(stage);
    expect(stage.dataset.chrome).toBe("shown");
  });

  it("keeps the controls up while the pointer is over them", async () => {
    const { stage } = renderStage();
    const bar = await screen.findByRole("toolbar");
    vi.useFakeTimers();
    fireEvent.pointerEnter(bar);
    act(() => vi.advanceTimersByTime(AUTO_HIDE_MS * 3));
    expect(stage.dataset.chrome).toBe("shown");
  });

  it("toggles the focused broadcast's mute with M, not while typing", async () => {
    renderStage();
    await screen.findByRole("toolbar");
    fireEvent.keyDown(window, { key: "m" });
    expect(screen.getByRole("button", { name: "Unmute (M)" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(screen.getByLabelText("elsewhere"), { key: "m" });
    expect(screen.getByRole("button", { name: "Unmute (M)" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "M" });
    expect(screen.getByRole("button", { name: "Mute (M)" })).toHaveAttribute("aria-pressed", "false");
  });

  it("requests fullscreen on the stage with F, the button and double-click", async () => {
    const request = vi.fn(async () => {});
    HTMLElement.prototype.requestFullscreen = request;
    const { stage } = renderStage();
    await screen.findByRole("toolbar");
    fireEvent.keyDown(window, { key: "f" });
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen (F)" }));
    fireEvent.doubleClick(stage.querySelector("video")!);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.contexts[0]).toBe(stage);
  });

  it("starts at the remembered volume, saves changes, and unmutes when raised", async () => {
    const storage = new Map<string, unknown>([["player.volume", 0.4]]);
    renderStage({ storage });
    const slider = (await screen.findByRole("slider", { name: "Volume" })) as HTMLInputElement;
    await vi.waitFor(() => expect(slider.value).toBe("0.4"));
    fireEvent.click(screen.getByRole("button", { name: "Mute (M)" }));
    expect(slider.value).toBe("0");
    fireEvent.change(slider, { target: { value: "0.6" } });
    expect(storage.get("player.volume")).toBe(0.6);
    expect(screen.getByRole("button", { name: "Mute (M)" })).toBeInTheDocument();
  });

  it("opens the mini player with its button and P", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderStage();
    fireEvent.click(await screen.findByRole("button", { name: "Mini player (P)" }));
    fireEvent.keyDown(window, { key: "p" });
    expect(open).toHaveBeenCalled();
    open.mockRestore();
  });

  it("uses the shell's native Picture-in-Picture where it has one", async () => {
    const enterPictureInPicture = vi.fn(async () => {});
    renderStage({
      platform: { capabilities: { host: false, systemAudio: false, floating: "pip", selfUpdate: false }, enterPictureInPicture },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Mini player (P)" }));
    expect(enterPictureInPicture).toHaveBeenCalled();
  });

  it("has no mini player button when the shell can't float", async () => {
    renderStage({ platform: { capabilities: { host: true, systemAudio: false, floating: "none", selfUpdate: false } } });
    await screen.findByRole("toolbar");
    expect(screen.queryByRole("button", { name: "Mini player (P)" })).not.toBeInTheDocument();
  });

  it("leaves the broadcast in focus", async () => {
    const { onLeave } = renderStage();
    fireEvent.click(await screen.findByRole("button", { name: "Leave this broadcast" }));
    expect(onLeave).toHaveBeenCalledWith("ABC234");
  });

  it("shows only the picture in the system's PiP window, and the controls again after", async () => {
    const { stage, rerenderPip } = renderStage({ pictureInPicture: true });
    await screen.findByRole("toolbar", { hidden: true });
    expect(stage.hasAttribute("data-pip")).toBe(true);
    vi.useFakeTimers();
    fireEvent.pointerMove(stage);
    act(() => vi.advanceTimersByTime(AUTO_HIDE_MS + 100));
    expect(stage.dataset.chrome).toBe("hidden");
    rerenderPip(false);
    expect(stage.hasAttribute("data-pip")).toBe(false);
    expect(stage.dataset.chrome).toBe("shown");
  });

  it("asks the shell for immersive landscape while fullscreen, and restores it after", async () => {
    const setImmersive = vi.fn(async () => {});
    const { stage, unmount } = renderStage({ platform: { setImmersive } });
    await screen.findByRole("toolbar");
    // jsdom has no Fullscreen API; stand in for what the browser reports.
    let current: Element | null = stage;
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => current });
    try {
      act(() => void document.dispatchEvent(new Event("fullscreenchange")));
      expect(setImmersive).toHaveBeenLastCalledWith(true);
      current = null;
      act(() => void document.dispatchEvent(new Event("fullscreenchange")));
      expect(setImmersive).toHaveBeenLastCalledWith(false);
    } finally {
      delete (document as { fullscreenElement?: unknown }).fullscreenElement;
      unmount();
    }
  });
});
