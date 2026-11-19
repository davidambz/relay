// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { SessionKind, ViewerEndReason } from "@relay/core";

// The app's sessions and which one is on the stage. Pure, so every
// combination of "on air" and "watching N broadcasts" is decided (and
// tested) here rather than in scattered conditions in App.
//
// There are two screens: home while nothing is running, and the stage
// otherwise. The stage shows one tile big (the focus) and the others in a
// strip below it; the person's own broadcast is one of those tiles.

/** The tile key of the person's own broadcast; watched ones use their code. */
export const SELF = "self";

export type Screen = "home" | "stage";

/** The header's status readout. */
export type HeaderStatus = "idle" | "live" | "watching" | "live-watching";

/** Why a note is showing; App turns it into text. */
export type Notice =
  | { kind: "source-ended" }
  | { kind: "viewer-ended"; code: string; reason: Exclude<ViewerEndReason, "left"> };

export interface OnAir<Broadcast> {
  broadcast: Broadcast;
  /** Bumped to start a fresh host session after a failure. */
  attempt: number;
}

export interface NavState<Broadcast> {
  onAir: OnAir<Broadcast> | null;
  /** The codes being watched, in the order they were added. */
  watching: string[];
  /** The tile shown big: SELF, a watched code, or null with nothing running. */
  focus: string | null;
  /** Shown until dismissed or replaced. */
  notice?: Notice;
}

export type NavAction<Broadcast> =
  | { type: "started"; broadcast: Broadcast }
  | { type: "retry" }
  | { type: "stopped" }
  | { type: "source-ended" }
  | { type: "watch"; code: string }
  | { type: "left"; code: string }
  | { type: "viewer-ended"; code: string; reason: ViewerEndReason }
  | { type: "focus"; tile: string }
  | { type: "dismiss-notice" }
  | { type: "back" };

export function initialNav<Broadcast>(): NavState<Broadcast> {
  return { onAir: null, watching: [], focus: null };
}

/** Every tile on the stage: the person's own broadcast first, then the watched ones. */
export function tilesOf(state: NavState<unknown>): string[] {
  return state.onAir ? [SELF, ...state.watching] : [...state.watching];
}

/** Keeps the focus on a tile that still exists, else moves it to another one. */
function refocus<B>(state: NavState<B>): NavState<B> {
  const tiles = tilesOf(state);
  if (state.focus !== null && tiles.includes(state.focus)) return state;
  // Prefer a watched broadcast: the person's own is just a preview.
  const next = state.watching[0] ?? (state.onAir ? SELF : null);
  return { ...state, focus: next };
}

export function navReducer<B>(state: NavState<B>, action: NavAction<B>): NavState<B> {
  switch (action.type) {
    case "started":
      // Going live while watching keeps the watched broadcast in focus.
      return {
        ...state,
        onAir: { broadcast: action.broadcast, attempt: 0 },
        focus: state.focus ?? SELF,
        notice: undefined,
      };
    case "retry":
      return state.onAir ? { ...state, onAir: { ...state.onAir, attempt: state.onAir.attempt + 1 } } : state;
    case "stopped":
      return state.onAir ? refocus({ ...state, onAir: null }) : state;
    case "source-ended":
      return state.onAir ? refocus({ ...state, onAir: null, notice: { kind: "source-ended" } }) : state;
    case "watch":
      // Already watching it: just bring it up.
      if (state.watching.includes(action.code)) return { ...state, focus: action.code };
      return { ...state, watching: [...state.watching, action.code], focus: action.code, notice: undefined };
    case "left":
      if (!state.watching.includes(action.code)) return state;
      return refocus({ ...state, watching: state.watching.filter((code) => code !== action.code) });
    case "viewer-ended": {
      // Late news from a session already left: nothing to update.
      if (!state.watching.includes(action.code)) return state;
      const next = refocus({ ...state, watching: state.watching.filter((code) => code !== action.code) });
      return action.reason === "left"
        ? next
        : { ...next, notice: { kind: "viewer-ended", code: action.code, reason: action.reason } };
    }
    case "focus":
      return tilesOf(state).includes(action.tile) && state.focus !== action.tile
        ? { ...state, focus: action.tile }
        : state;
    case "dismiss-notice":
      return state.notice ? { ...state, notice: undefined } : state;
    case "back":
      // Back leaves the watched broadcast in focus; a live broadcast is
      // only ended by Stop.
      if (state.focus !== null && state.focus !== SELF) return navReducer(state, { type: "left", code: state.focus });
      return state;
  }
}

/** Whether back has somewhere to go in the app (else it leaves the app). */
export function canGoBack<B>(state: NavState<B>): boolean {
  return navReducer(state, { type: "back" }) !== state;
}

export interface NavView {
  screen: Screen;
  status: HeaderStatus;
  /** What the shell is told (broadcasting outranks watching: quitting asks first). */
  session: SessionKind | null;
  tiles: string[];
}

export function deriveView(state: NavState<unknown>): NavView {
  const live = state.onAir !== null;
  const watching = state.watching.length > 0;
  return {
    screen: live || watching ? "stage" : "home",
    status: live ? (watching ? "live-watching" : "live") : watching ? "watching" : "idle",
    session: live ? "broadcasting" : watching ? "watching" : null,
    tiles: tilesOf(state),
  };
}
