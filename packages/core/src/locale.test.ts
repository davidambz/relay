// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { resolveSupportedLocale } from "./locale";

const SUPPORTED = ["en", "pt-BR"] as const;

describe("resolveSupportedLocale", () => {
  it("matches exactly, case-insensitively", () => {
    expect(resolveSupportedLocale("pt-br", SUPPORTED, "en")).toBe("pt-BR");
    expect(resolveSupportedLocale("EN", SUPPORTED, "en")).toBe("en");
  });

  it("falls back to the same base language", () => {
    expect(resolveSupportedLocale("pt", SUPPORTED, "en")).toBe("pt-BR");
    expect(resolveSupportedLocale("pt-PT", SUPPORTED, "en")).toBe("pt-BR");
    expect(resolveSupportedLocale("en-GB", SUPPORTED, "en")).toBe("en");
  });

  it("uses the fallback for unknown or empty tags", () => {
    expect(resolveSupportedLocale("de-DE", SUPPORTED, "en")).toBe("en");
    expect(resolveSupportedLocale("", SUPPORTED, "en")).toBe("en");
  });
});
