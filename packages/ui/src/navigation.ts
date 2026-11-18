// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { SessionKind, ViewerEndReason } from "@relay/core";

// Which screen is up, and the two sessions that outlive it. Pure, so every
// combination of "on air" and "watching" is decided (and tested) here
// rather than in scattered conditions in App.
//
// Invariant: while watching, the screen is the player ("viewing"), or the
// broadcast's ("live") when also on air. Anything else would leave the
// player playing hidden with no way back to it, so it's refused (or, when
// the broadcast ends, the player comes back up).

export type Screen = "home" | "pick" | "live" | "watch" | "viewing";

/** The header's status readout. */
export type HeaderStatus = "idle" | "live" | "watching" | "live-watching";
/** Both sessions running: which one is on screen. */
export type HeaderView = "live" | "watching";

/** Why a screen is showing a note; App turns it into text. */
export type Notice =
  | { kind: "source-ended" }
  | { kind: "viewer-ended"; reason: Exclude<ViewerEndReason, "left"> }
  | { kind: "watched-ended" };

export interface OnAir<Broadcast> {
  broadcast: Broadcast;
  /** Bumped to start a fresh host session after a failure. */
  attempt: number;
}

export interface NavState<Broadcast> {
  screen: Screen;
  /** Shown on the screen it was raised for, until the next navigation. */
  notice?: { screen: Screen; notice: Notice };
  onAir: OnAir<Broadcast> | null;
  /** The code being watched, if any. */
  watching: string | null;
}

export type NavAction<Broadcast> =
  | { type: "go"; screen: Screen }
  | { type: "started"; broadcast: Broadcast }
  | { type: "retry" }
  | { type: "stopped" }
  | { type: "source-ended" }
  | { type: "watch"; code: string }
  | { type: "left" }
  | { type: "viewer-ended"; reason: ViewerEndReason }
  | { type: "back" };

export function initialNav<Broadcast>(): NavState<Broadcast> {
  return { screen: "home", onAir: null, watching: null };
}

function show<B>(state: NavState<B>, screen: Screen, notice?: Notice): NavState<B> {
  return { ...state, screen, notice: notice && { screen, notice } };
}

/** Where a request to show `screen` actually leads, or null to refuse it. */
function resolve<B>(state: NavState<B>, screen: Screen): Screen | null {
  if (screen === "live" && !state.onAir) return null;
  if (state.watching && screen !== "viewing" && screen !== "live") return null;
  if (screen === "viewing" && !state.watching) return null;
  // One broadcast at a time: "broadcast" from home returns to it.
  if (screen === "pick" && state.onAir) return "live";
  return screen;
}

export function navReducer<B>(state: NavState<B>, action: NavAction<B>): NavState<B> {
  switch (action.type) {
    case "go": {
      const target = resolve(state, action.screen);
      return target === null || target === state.screen ? state : show(state, target);
    }
    case "started":
      return show({ ...state, onAir: { broadcast: action.broadcast, attempt: 0 } }, "live");
    case "retry":
      return state.onAir ? { ...state, onAir: { ...state.onAir, attempt: state.onAir.attempt + 1 } } : state;
    case "stopped":
      return show({ ...state, onAir: null }, state.watching ? "viewing" : "pick");
    case "source-ended": {
      const next = { ...state, onAir: null };
      // Watching something meanwhile? That's where they land.
      if (state.watching) return state.screen === "viewing" ? next : show(next, "viewing");
      // From the broadcast's screens, to the picker with why; elsewhere, stay.
      if (state.screen === "live" || state.screen === "watch") return show(next, "pick", { kind: "source-ended" });
      return next;
    }
    case "watch":
      if (state.watching) return state;
      return show({ ...state, watching: action.code }, "viewing");
    case "left":
      return show({ ...state, watching: null }, "watch");
    case "viewer-ended": {
      // Late news from a session already left: nothing to update.
      if (!state.watching) return state;
      const next = { ...state, watching: null };
      if (state.screen === "viewing") {
        return show(next, "watch", action.reason === "left" ? undefined : { kind: "viewer-ended", reason: action.reason });
      }
      // On their own broadcast's screen meanwhile: stay, and say why.
      return action.reason === "left" ? next : show(next, state.screen, { kind: "watched-ended" });
    }
    case "back":
      if (state.screen === "viewing") return navReducer(state, { type: "left" });
      if (state.screen === "watch" || state.screen === "pick") return show(state, "home");
      return state;
  }
}

/** Whether back has somewhere to go in the app (else it leaves the app). */
export function canGoBack<B>(state: NavState<B>): boolean {
  return navReducer(state, { type: "back" }) !== state;
}

export interface NavView {
  status: HeaderStatus;
  /** What the shell is told (broadcasting outranks watching: quitting asks first). */
  session: SessionKind | null;
  /** Both sessions running: the header's switch, and which side is up. */
  headerView?: HeaderView;
  /** On air, not watching, on another screen: the header leads back. */
  returnToLive: boolean;
  /** Live offers "watch another broadcast" (not while already watching one). */
  canWatchFromLive: boolean;
  /** The notice for the current screen, if any. */
  notice?: Notice;
}

export function deriveView(state: NavState<unknown>): NavView {
  const live = state.onAir !== null;
  const watching = state.watching !== null;
  return {
    status: live ? (watching ? "live-watching" : "live") : watching ? "watching" : "idle",
    session: live ? "broadcasting" : watching ? "watching" : null,
    headerView: live && watching ? (state.screen === "viewing" ? "watching" : "live") : undefined,
    returnToLive: live && !watching && state.screen !== "live",
    canWatchFromLive: live && !watching,
    notice: state.notice?.screen === state.screen ? state.notice.notice : undefined,
  };
}
