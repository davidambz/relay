// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { canGoBack, deriveView, initialNav, navReducer, type NavAction, type NavState } from "./navigation";

type Nav = NavState<string>;

function run(...actions: NavAction<string>[]): Nav {
  return actions.reduce<Nav>(navReducer, initialNav<string>());
}

const onAir: NavAction<string>[] = [{ type: "go", screen: "pick" }, { type: "started", broadcast: "stream" }];
const watchingAlone: NavAction<string>[] = [{ type: "go", screen: "watch" }, { type: "watch", code: "ABC234" }];
const both: NavAction<string>[] = [...onAir, { type: "go", screen: "watch" }, { type: "watch", code: "ABC234" }];

describe("navReducer", () => {
  it("starts at home, idle", () => {
    const state = run();
    expect(state.screen).toBe("home");
    expect(deriveView(state)).toMatchObject({ status: "idle", session: null, returnToLive: false });
  });

  it("goes on air from the picker", () => {
    const state = run(...onAir);
    expect(state).toMatchObject({ screen: "live", onAir: { broadcast: "stream", attempt: 0 } });
    expect(deriveView(state)).toMatchObject({ status: "live", session: "broadcasting", canWatchFromLive: true });
  });

  it("sends the broadcast button back to the running broadcast", () => {
    const state = run(...onAir, { type: "go", screen: "home" }, { type: "go", screen: "pick" });
    expect(state.screen).toBe("live");
  });

  it("refuses screens whose session isn't running", () => {
    expect(run({ type: "go", screen: "live" }).screen).toBe("home");
    expect(run({ type: "go", screen: "viewing" }).screen).toBe("home");
  });

  it("leads back to the broadcast from other screens while on air", () => {
    const state = run(...onAir, { type: "go", screen: "watch" });
    expect(deriveView(state).returnToLive).toBe(true);
    expect(navReducer(state, { type: "go", screen: "live" }).screen).toBe("live");
  });

  it("restarts the host session on retry", () => {
    expect(run(...onAir, { type: "retry" }).onAir?.attempt).toBe(1);
  });

  describe("on air and watching", () => {
    it("shows both, with the switch on the player", () => {
      const state = run(...both);
      expect(state).toMatchObject({ screen: "viewing", watching: "ABC234" });
      expect(deriveView(state)).toMatchObject({
        status: "live-watching",
        session: "broadcasting",
        headerView: "watching",
        returnToLive: false,
        canWatchFromLive: false,
      });
    });

    it("switches between the two screens, keeping both sessions", () => {
      const live = run(...both, { type: "go", screen: "live" });
      expect(live).toMatchObject({ screen: "live", watching: "ABC234", onAir: { attempt: 0 } });
      expect(deriveView(live).headerView).toBe("live");
      expect(navReducer(live, { type: "go", screen: "viewing" }).screen).toBe("viewing");
    });

    it.each(["home", "pick", "watch"] as const)("refuses %s, which would strand the hidden player", (screen) => {
      const state = run(...both, { type: "go", screen: "live" });
      expect(navReducer(state, { type: "go", screen })).toBe(state);
    });

    it("lands on the player when the broadcast is stopped", () => {
      const state = run(...both, { type: "go", screen: "live" }, { type: "stopped" });
      expect(state).toMatchObject({ screen: "viewing", onAir: null, watching: "ABC234" });
    });

    it("lands on the player when the shared window closes", () => {
      const fromLive = run(...both, { type: "go", screen: "live" }, { type: "source-ended" });
      expect(fromLive).toMatchObject({ screen: "viewing", onAir: null });
      const fromPlayer = run(...both, { type: "source-ended" });
      expect(fromPlayer).toMatchObject({ screen: "viewing", onAir: null });
      expect(deriveView(fromPlayer).status).toBe("watching");
    });

    it("says so on the broadcast's screen when the watched one ends there", () => {
      const state = run(...both, { type: "go", screen: "live" }, { type: "viewer-ended", reason: "ended" });
      expect(state).toMatchObject({ screen: "live", watching: null });
      expect(deriveView(state)).toMatchObject({ notice: { kind: "watched-ended" }, headerView: undefined, status: "live" });
      // The note goes away with the next navigation.
      const later = navReducer(navReducer(state, { type: "go", screen: "watch" }), { type: "go", screen: "live" });
      expect(deriveView(later).notice).toBeUndefined();
    });

    it("leaving the player keeps the broadcast", () => {
      const state = run(...both, { type: "left" });
      expect(state).toMatchObject({ screen: "watch", watching: null, onAir: { attempt: 0 } });
      expect(deriveView(state).returnToLive).toBe(true);
    });
  });

  describe("watching alone", () => {
    it("goes back to the code screen with the reason when it ends", () => {
      const state = run(...watchingAlone, { type: "viewer-ended", reason: "not-found" });
      expect(state).toMatchObject({ screen: "watch", watching: null });
      expect(deriveView(state).notice).toEqual({ kind: "viewer-ended", reason: "not-found" });
    });

    it("says nothing when the person left", () => {
      const state = run(...watchingAlone, { type: "viewer-ended", reason: "left" });
      expect(deriveView(state).notice).toBeUndefined();
    });

    it("can't wander off the player", () => {
      const state = run(...watchingAlone);
      expect(navReducer(state, { type: "go", screen: "home" })).toBe(state);
    });
  });

  it("goes to the picker with a note when the shared window closes", () => {
    const state = run(...onAir, { type: "source-ended" });
    expect(state).toMatchObject({ screen: "pick", onAir: null });
    expect(deriveView(state).notice).toEqual({ kind: "source-ended" });
  });

  it("goes to the picker after stopping", () => {
    expect(run(...onAir, { type: "stopped" })).toMatchObject({ screen: "pick", onAir: null });
  });
});

describe("back", () => {
  it("steps back through the screens, leaving the player first", () => {
    let state = run(...watchingAlone);
    expect(canGoBack(state)).toBe(true);
    state = navReducer(state, { type: "back" });
    expect(state).toMatchObject({ screen: "watch", watching: null });
    state = navReducer(state, { type: "back" });
    expect(state.screen).toBe("home");
    expect(canGoBack(state)).toBe(false);
  });

  it("doesn't end a broadcast", () => {
    const state = run(...onAir);
    expect(canGoBack(state)).toBe(false);
    expect(navReducer(state, { type: "back" })).toBe(state);
  });
});
