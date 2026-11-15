// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { evaluateRelease, isNewerVersion, parseVersion } from "./updates";

describe("parseVersion", () => {
  it("accepts X.Y.Z with an optional v", () => {
    expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseVersion("v0.10.0")).toEqual({ major: 0, minor: 10, patch: 0 });
  });

  it("rejects anything else", () => {
    for (const bad of ["1.2", "1.2.3.4", "v1.2.3-beta", "", "latest", "1.x.0"]) expect(parseVersion(bad)).toBeNull();
  });
});

describe("isNewerVersion", () => {
  it("compares numerically, component by component", () => {
    const v = (text: string) => parseVersion(text)!;
    expect(isNewerVersion(v("0.1.9"), v("0.1.10"))).toBe(true);
    expect(isNewerVersion(v("0.2.0"), v("0.1.99"))).toBe(false);
    expect(isNewerVersion(v("1.0.0"), v("1.0.0"))).toBe(false);
    expect(isNewerVersion(v("1.9.9"), v("2.0.0"))).toBe(true);
  });
});

describe("evaluateRelease", () => {
  const release = (tag: string, assets: object[] = [{ name: `RelaySetup-${tag.replace("v", "")}.exe`, browser_download_url: "https://example.com/setup.exe" }]) => ({
    tag_name: tag,
    assets,
  });

  it("offers a newer release with its installer", () => {
    expect(evaluateRelease("0.1.0", release("v0.2.0"))).toEqual({
      status: "available",
      latestVersion: "0.2.0",
      downloadUrl: "https://example.com/setup.exe",
    });
  });

  it("is up to date on the same or an older release", () => {
    expect(evaluateRelease("0.2.0", release("v0.2.0"))).toMatchObject({ status: "up-to-date" });
    expect(evaluateRelease("0.3.0", release("v0.2.0"))).toMatchObject({ status: "up-to-date" });
  });

  it("doesn't offer a release whose installer isn't attached yet", () => {
    expect(evaluateRelease("0.1.0", release("v0.2.0", [{ name: "notes.txt", browser_download_url: "x" }]))).toMatchObject({ status: "up-to-date" });
  });

  it("treats odd tags as nothing to offer and a bad current version as a failure", () => {
    expect(evaluateRelease("0.1.0", { tag_name: "nightly" })).toEqual({ status: "up-to-date" });
    expect(evaluateRelease("dev", release("v0.2.0"))).toMatchObject({ status: "failed" });
  });
});
