// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

/** True when a keystroke belongs to a text field rather than the player. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !["range", "checkbox", "radio", "button", "submit", "reset"].includes(target.type);
  }
  return false;
}

export type PlayerAction = "fullscreen" | "mute" | "floating";

export function actionForKey(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">): PlayerAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  switch (event.key.toLowerCase()) {
    case "f":
      return "fullscreen";
    case "m":
      return "mute";
    case "p":
      return "floating";
    default:
      return null;
  }
}
