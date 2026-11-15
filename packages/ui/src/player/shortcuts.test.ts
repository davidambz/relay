// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { actionForKey, isTypingTarget } from "./shortcuts";

describe("actionForKey", () => {
  it("maps F, M and P case-insensitively", () => {
    const key = (k: string) => actionForKey({ key: k, ctrlKey: false, metaKey: false, altKey: false });
    expect([key("f"), key("F"), key("m"), key("p"), key("x")]).toEqual(["fullscreen", "fullscreen", "mute", "floating", null]);
  });

  it("leaves modified keys alone (Ctrl+F, Alt+M…)", () => {
    expect(actionForKey({ key: "f", ctrlKey: true, metaKey: false, altKey: false })).toBeNull();
    expect(actionForKey({ key: "m", ctrlKey: false, metaKey: false, altKey: true })).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("treats text inputs and textareas as typing, sliders and buttons not", () => {
    const make = (type: string) => Object.assign(document.createElement("input"), { type });
    expect(isTypingTarget(make("text"))).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(make("range"))).toBe(false);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
