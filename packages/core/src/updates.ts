// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

// Self-update decisions, same rules as Umbra's updater: GitHub's latest
// release is compared X.Y.Z against the running version, and an update is
// only offered once its installer asset is actually attached.

export interface Version {
  major: number;
  minor: number;
  patch: number;
}

/** Parses "X.Y.Z" or "vX.Y.Z"; anything else (pre-release tags included) is null. */
export function parseVersion(text: string): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function isNewerVersion(current: Version, candidate: Version): boolean {
  if (candidate.major !== current.major) return candidate.major > current.major;
  if (candidate.minor !== current.minor) return candidate.minor > current.minor;
  return candidate.patch > current.patch;
}

export type UpdateCheck =
  | { status: "up-to-date"; latestVersion?: string }
  | { status: "available"; latestVersion: string; downloadUrl: string }
  | { status: "failed"; reason: string };

export const INSTALLER_PREFIX = "RelaySetup-";

interface ReleaseAsset {
  name?: unknown;
  browser_download_url?: unknown;
}

/**
 * Decides what a GitHub "latest release" response means for this build.
 * A tag that isn't X.Y.Z counts as "nothing to offer", not an error (it's
 * a network response, not our own CI output), and so does a release whose
 * RelaySetup-*.exe isn't attached yet (the release workflow still running).
 */
export function evaluateRelease(currentVersion: string, release: unknown): UpdateCheck {
  const current = parseVersion(currentVersion);
  if (!current) return { status: "failed", reason: `current version "${currentVersion}" isn't X.Y.Z` };
  if (typeof release !== "object" || release === null) return { status: "failed", reason: "unexpected response" };

  const tag = (release as { tag_name?: unknown }).tag_name;
  const latest = typeof tag === "string" ? parseVersion(tag) : null;
  if (!latest) return { status: "up-to-date" };
  const latestVersion = `${latest.major}.${latest.minor}.${latest.patch}`;
  if (!isNewerVersion(current, latest)) return { status: "up-to-date", latestVersion };

  const assets = (release as { assets?: unknown }).assets;
  const installer = Array.isArray(assets)
    ? (assets as ReleaseAsset[]).find(
        (asset) =>
          typeof asset.name === "string" &&
          asset.name.startsWith(INSTALLER_PREFIX) &&
          asset.name.toLowerCase().endsWith(".exe") &&
          typeof asset.browser_download_url === "string",
      )
    : undefined;
  if (!installer) return { status: "up-to-date", latestVersion: currentVersion };
  return { status: "available", latestVersion, downloadUrl: installer.browser_download_url as string };
}
