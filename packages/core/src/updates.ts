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
  | {
      status: "available";
      latestVersion: string;
      downloadUrl: string;
      /** Lowercase hex SHA-256 of the installer, when GitHub reports one. */
      sha256?: string;
    }
  | { status: "failed"; reason: string };

export const INSTALLER_PREFIX = "RelaySetup-";

/** Which release asset a shell installs: name prefix and extension. */
export interface ReleaseAssetKind {
  prefix: string;
  extension: string;
}

/** The Windows installer (Inno Setup). */
export const WINDOWS_INSTALLER: ReleaseAssetKind = { prefix: INSTALLER_PREFIX, extension: ".exe" };
/** The Android app, signed with the release key. */
export const ANDROID_APK: ReleaseAssetKind = { prefix: "Relay-", extension: ".apk" };

interface ReleaseAsset {
  name?: unknown;
  browser_download_url?: unknown;
  digest?: unknown;
}

/** Where a repo's release assets live; anything else is refused. */
export function releaseDownloadPrefix(repo: string): string {
  return `https://github.com/${repo}/releases/download/`;
}

/** Compares the normalized URL, so "../" segments can't climb out of the repo. */
function isReleaseDownload(url: string, repo: string): boolean {
  try {
    return new URL(url).href.startsWith(releaseDownloadPrefix(repo));
  } catch {
    return false;
  }
}

/** "sha256:<64 hex>" (GitHub's asset digest) → lowercase hex, else undefined. */
export function parseSha256Digest(digest: unknown): string | undefined {
  if (typeof digest !== "string") return undefined;
  const match = /^sha256:([0-9a-f]{64})$/i.exec(digest.trim());
  return match ? match[1].toLowerCase() : undefined;
}

/**
 * Decides what a GitHub "latest release" response means for this build.
 * A tag that isn't X.Y.Z counts as "nothing to offer", not an error (it's
 * a network response, not our own CI output), and so does a release whose
 * installer (RelaySetup-*.exe, or the shell's own kind, such as the APK)
 * isn't attached yet (the release workflow still running).
 *
 * The installer must be downloaded from `repo`'s own releases, since it's
 * run right after. Its SHA-256 comes along when GitHub reports a digest;
 * a missing digest isn't an error (it must never strand users on an old
 * version), but a present one is checked after the download.
 */
export function evaluateRelease(
  currentVersion: string,
  release: unknown,
  repo: string,
  asset: ReleaseAssetKind = WINDOWS_INSTALLER,
): UpdateCheck {
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
        (candidate) =>
          typeof candidate.name === "string" &&
          candidate.name.startsWith(asset.prefix) &&
          candidate.name.toLowerCase().endsWith(asset.extension) &&
          typeof candidate.browser_download_url === "string",
      )
    : undefined;
  // Nothing to offer yet; the release workflow is likely still attaching it.
  if (!installer) return { status: "up-to-date" };
  const downloadUrl = installer.browser_download_url as string;
  if (!isReleaseDownload(downloadUrl, repo)) {
    return { status: "failed", reason: `installer URL isn't one of ${repo}'s release downloads` };
  }
  const sha256 = parseSha256Digest(installer.digest);
  return sha256
    ? { status: "available", latestVersion, downloadUrl, sha256 }
    : { status: "available", latestVersion, downloadUrl };
}
