// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { PlatformContext } from "../platform/PlatformContext";
import { fakePlatform } from "../test/fakePlatform";
import { useVolumes } from "./useVolume";

function setup(codes: string[], stored: Record<string, unknown> = {}) {
  const storage = new Map<string, unknown>(Object.entries(stored));
  const platform = fakePlatform({
    storage: {
      get: async <T,>(key: string) => storage.get(key) as T | undefined,
      set: async (key, value) => void storage.set(key, value),
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>
  );
  const hook = renderHook(({ list }) => useVolumes(list), { wrapper, initialProps: { list: codes } });
  const level = (code: string) => {
    const { volume, muted } = hook.result.current.controlsFor(code);
    return { volume, muted };
  };
  return { ...hook, storage, level };
}

describe("useVolumes", () => {
  it("starts a new broadcast at the last volume and mute", async () => {
    const { level } = setup(["AAAAAA"], { "player.volume": 0.3, "player.muted": true });
    await waitFor(() => expect(level("AAAAAA")).toEqual({ volume: 0.3, muted: true }));
  });

  it("restores a broadcast as it was left when watched again", async () => {
    const { result, rerender, level, storage } = setup(["AAAAAA"]);
    await waitFor(() => expect(storage.size).toBe(0));
    act(() => result.current.controlsFor("AAAAAA").setVolume(0.5));
    act(() => result.current.controlsFor("AAAAAA").toggleMuted());
    rerender({ list: [] });
    rerender({ list: ["AAAAAA"] });
    expect(level("AAAAAA")).toEqual({ volume: 0.5, muted: true });
    // And after the app restarts.
    const again = setup(["AAAAAA"], Object.fromEntries(storage));
    await waitFor(() => expect(again.level("AAAAAA")).toEqual({ volume: 0.5, muted: true }));
  });

  it("makes mute the default only while one broadcast is open", async () => {
    const { result, rerender, level, storage } = setup(["AAAAAA", "BBBBBB"]);
    await waitFor(() => expect(level("AAAAAA").volume).toBe(1));
    act(() => result.current.controlsFor("AAAAAA").toggleMuted());
    expect(storage.has("player.muted")).toBe(false);
    rerender({ list: ["AAAAAA", "BBBBBB", "CCCCCC"] });
    expect(level("CCCCCC").muted).toBe(false);

    rerender({ list: ["BBBBBB"] });
    act(() => result.current.controlsFor("BBBBBB").toggleMuted());
    expect(storage.get("player.muted")).toBe(true);
    rerender({ list: ["BBBBBB", "DDDDDD"] });
    expect(level("DDDDDD").muted).toBe(true);
  });

  it("doesn't move a broadcast nobody touched when another one's volume changes", async () => {
    const { result, level } = setup(["AAAAAA", "BBBBBB"], { "player.volume": 0.8 });
    await waitFor(() => expect(level("BBBBBB").volume).toBe(0.8));
    act(() => result.current.controlsFor("AAAAAA").setVolume(0.2));
    expect(level("AAAAAA").volume).toBe(0.2);
    expect(level("BBBBBB").volume).toBe(0.8);
  });

  it("remembers a limited number of broadcasts", async () => {
    const { result, rerender, storage } = setup([]);
    for (let i = 0; i < 25; i++) {
      const code = `CODE${String(i).padStart(2, "0")}`;
      rerender({ list: [code] });
      act(() => result.current.controlsFor(code).setVolume(0.5));
    }
    const remembered = Object.keys(storage.get("player.levels") as object);
    expect(remembered).toHaveLength(20);
    expect(remembered.at(-1)).toBe("CODE24");
    expect(remembered).not.toContain("CODE00");
  });
});
