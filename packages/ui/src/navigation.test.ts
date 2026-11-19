// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { canGoBack, deriveView, initialNav, navReducer, SELF, type NavAction, type NavState } from "./navigation";

type Nav = NavState<string>;

function run(...actions: NavAction<string>[]): Nav {
  return actions.reduce<Nav>(navReducer, initialNav<string>());
}

const goLive: NavAction<string> = { type: "started", broadcast: "stream" };
const watch = (code: string): NavAction<string> => ({ type: "watch", code });

describe("navReducer", () => {
  it("starts at home, idle", () => {
    const state = run();
    expect(state.focus).toBeNull();
    expect(deriveView(state)).toEqual({ screen: "home", status: "idle", session: null, tiles: [] });
  });

  it("goes on air onto the stage, focused on the person's own broadcast", () => {
    const state = run(goLive);
    expect(state).toMatchObject({ onAir: { broadcast: "stream", attempt: 0 }, focus: SELF });
    expect(deriveView(state)).toEqual({ screen: "stage", status: "live", session: "broadcasting", tiles: [SELF] });
  });

  it("watches several broadcasts, focusing the newest, own broadcast first in the tiles", () => {
    const state = run(goLive, watch("ABC234"), watch("XYZ789"));
    expect(state.focus).toBe("XYZ789");
    expect(deriveView(state)).toMatchObject({
      status: "live-watching",
      session: "broadcasting",
      tiles: [SELF, "ABC234", "XYZ789"],
    });
  });

  it("keeps a watched broadcast in focus when going live meanwhile", () => {
    const state = run(watch("ABC234"), goLive);
    expect(state.focus).toBe("ABC234");
    expect(deriveView(state).tiles).toEqual([SELF, "ABC234"]);
  });

  it("brings an already watched code up instead of adding it twice", () => {
    const state = run(watch("ABC234"), watch("XYZ789"), watch("ABC234"));
    expect(state.watching).toEqual(["ABC234", "XYZ789"]);
    expect(state.focus).toBe("ABC234");
  });

  it("focuses any tile on the stage, and nothing that isn't there", () => {
    const state = run(goLive, watch("ABC234"), { type: "focus", tile: SELF });
    expect(state.focus).toBe(SELF);
    expect(navReducer(state, { type: "focus", tile: "NOPE23" })).toBe(state);
    expect(navReducer(state, { type: "focus", tile: SELF })).toBe(state);
  });

  it("moves the focus to a watched broadcast when the focused one goes", () => {
    const state = run(goLive, watch("ABC234"), watch("XYZ789"), { type: "left", code: "XYZ789" });
    expect(state.focus).toBe("ABC234");
    expect(run(goLive, watch("ABC234"), { type: "left", code: "ABC234" }).focus).toBe(SELF);
  });

  it("leaves the focus alone when another tile goes", () => {
    const state = run(goLive, watch("ABC234"), watch("XYZ789"), { type: "left", code: "ABC234" });
    expect(state.focus).toBe("XYZ789");
  });

  it("stays on the stage watching when the broadcast stops", () => {
    const state = run(goLive, watch("ABC234"), { type: "focus", tile: SELF }, { type: "stopped" });
    expect(state).toMatchObject({ onAir: null, focus: "ABC234" });
    expect(deriveView(state)).toMatchObject({ screen: "stage", status: "watching", session: "watching" });
  });

  it("returns home when the last session ends", () => {
    expect(deriveView(run(goLive, { type: "stopped" })).screen).toBe("home");
    expect(deriveView(run(watch("ABC234"), { type: "left", code: "ABC234" })).screen).toBe("home");
  });

  it("says why when the shared window closes", () => {
    const state = run(goLive, { type: "source-ended" });
    expect(state).toMatchObject({ onAir: null, focus: null, notice: { kind: "source-ended" } });
    expect(navReducer(state, { type: "dismiss-notice" }).notice).toBeUndefined();
  });

  it("drops a watched broadcast that ends, saying which and why", () => {
    const state = run(goLive, watch("ABC234"), { type: "viewer-ended", code: "ABC234", reason: "not-found" });
    expect(state).toMatchObject({
      watching: [],
      focus: SELF,
      notice: { kind: "viewer-ended", code: "ABC234", reason: "not-found" },
    });
  });

  it("says nothing when the person left on their own", () => {
    const state = run(watch("ABC234"), { type: "viewer-ended", code: "ABC234", reason: "left" });
    expect(state.notice).toBeUndefined();
    expect(deriveView(state).screen).toBe("home");
  });

  it("ignores late news from a session already left", () => {
    const state = run(watch("ABC234"), { type: "left", code: "ABC234" });
    expect(navReducer(state, { type: "viewer-ended", code: "ABC234", reason: "ended" })).toBe(state);
  });

  it("clears an old notice when something new starts", () => {
    const ended = run(goLive, { type: "source-ended" });
    expect(navReducer(ended, goLive).notice).toBeUndefined();
    expect(navReducer(ended, watch("ABC234")).notice).toBeUndefined();
  });

  it("bumps the attempt on retry, keeping the broadcast", () => {
    const state = run(goLive, { type: "retry" });
    expect(state.onAir).toEqual({ broadcast: "stream", attempt: 1 });
    expect(navReducer(initialNav<string>(), { type: "retry" }).onAir).toBeNull();
  });

  it("goes back by leaving the watched broadcast in focus, never by ending the broadcast", () => {
    const watching = run(goLive, watch("ABC234"));
    expect(canGoBack(watching)).toBe(true);
    const back = navReducer(watching, { type: "back" });
    expect(back).toMatchObject({ watching: [], focus: SELF });
    expect(canGoBack(back)).toBe(false);
    expect(canGoBack(run())).toBe(false);
  });
});
