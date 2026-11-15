// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { evaluateRelease as evaluate, isNewerVersion, parseSha256Digest, parseVersion } from "./updates";

const REPO = "davidambz/relay";
const URL = `https://github.com/${REPO}/releases/download/v0.2.0/RelaySetup-0.2.0.exe`;
const evaluateRelease = (current: string, release: unknown) => evaluate(current, release, REPO);

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
  const release = (tag: string, assets: object[] = [{ name: `RelaySetup-${tag.replace("v", "")}.exe`, browser_download_url: URL }]) => ({
    tag_name: tag,
    assets,
  });

  it("offers a newer release with its installer", () => {
    expect(evaluateRelease("0.1.0", release("v0.2.0"))).toEqual({
      status: "available",
      latestVersion: "0.2.0",
      downloadUrl: URL,
    });
  });

  it("carries the installer's SHA-256 when GitHub reports a digest", () => {
    const hex = "AB".repeat(32);
    const withDigest = release("v0.2.0", [{ name: "RelaySetup-0.2.0.exe", browser_download_url: URL, digest: `sha256:${hex}` }]);
    expect(evaluateRelease("0.1.0", withDigest)).toMatchObject({ status: "available", sha256: hex.toLowerCase() });
  });

  it("refuses an installer hosted anywhere but the repo's releases", () => {
    for (const url of ["https://example.com/RelaySetup.exe", "https://github.com/someone/else/releases/download/v0.2.0/RelaySetup-0.2.0.exe", "http://github.com/davidambz/relay/releases/download/x.exe", "https://github.com/davidambz/relay/releases/download/../../../evil/x/releases/download/RelaySetup.exe", "not a url"]) {
      const bad = release("v0.2.0", [{ name: "RelaySetup-0.2.0.exe", browser_download_url: url }]);
      expect(evaluateRelease("0.1.0", bad)).toMatchObject({ status: "failed" });
    }
  });

  it("is up to date on the same or an older release", () => {
    expect(evaluateRelease("0.2.0", release("v0.2.0"))).toMatchObject({ status: "up-to-date" });
    expect(evaluateRelease("0.3.0", release("v0.2.0"))).toMatchObject({ status: "up-to-date" });
  });

  it("doesn't offer a release whose installer isn't attached yet", () => {
    expect(evaluateRelease("0.1.0", release("v0.2.0", [{ name: "notes.txt", browser_download_url: "x" }]))).toEqual({ status: "up-to-date" });
  });

  it("treats odd tags as nothing to offer and a bad current version as a failure", () => {
    expect(evaluateRelease("0.1.0", { tag_name: "nightly" })).toEqual({ status: "up-to-date" });
    expect(evaluateRelease("dev", release("v0.2.0"))).toMatchObject({ status: "failed" });
  });
});

describe("parseSha256Digest", () => {
  it("reads GitHub's sha256:<hex> digests and ignores anything else", () => {
    expect(parseSha256Digest(`sha256:${"0f".repeat(32)}`)).toBe("0f".repeat(32));
    for (const bad of [undefined, null, "", "sha256:abc", `sha512:${"0f".repeat(32)}`, `${"0f".repeat(32)}`]) {
      expect(parseSha256Digest(bad)).toBeUndefined();
    }
  });
});
