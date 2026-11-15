// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { CODE_LENGTH, generateCode, isValidCode, normalizeCode, peerIdForCode } from "./code";

describe("generateCode", () => {
  it("produces a code of the right length from the alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(isValidCode(code)).toBe(true);
    }
  });

  it("maps random bytes onto the alphabet deterministically", () => {
    const code = generateCode((bytes) => {
      bytes.set([0, 1, 31, 32, 255, 64]);
      return bytes;
    });
    // indices 0, 1, 31, 0 (32 % 32), 31 (255 % 32), 0 (64 % 32)
    expect(code).toBe("AB9A9A");
  });

  it("never emits the look-alike characters", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).not.toMatch(/[01OI]/);
    }
  });
});

describe("normalizeCode", () => {
  it("uppercases and strips spaces and dashes", () => {
    expect(normalizeCode(" ab-c d2 3 ")).toBe("ABCD23");
  });
});

describe("isValidCode", () => {
  it("rejects wrong lengths and characters outside the alphabet", () => {
    expect(isValidCode("ABCDE")).toBe(false);
    expect(isValidCode("ABCDEFG")).toBe(false);
    expect(isValidCode("ABCDE0")).toBe(false);
    expect(isValidCode("ABCDEO")).toBe(false);
    expect(isValidCode("abcdef")).toBe(false);
    expect(isValidCode("ABCDEF")).toBe(true);
  });
});

describe("peerIdForCode", () => {
  it("prefixes valid codes and refuses invalid ones", () => {
    expect(peerIdForCode("ABC234")).toBe("relay-tenno-v1-ABC234");
    expect(() => peerIdForCode("nope")).toThrow();
  });
});
