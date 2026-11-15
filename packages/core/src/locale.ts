// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Picks the best shipped locale for a BCP 47 tag: exact match first
 * (case-insensitive), then the same base language ("pt-PT" → "pt-BR"),
 * then the fallback. Same rule Umbra's settings UI uses.
 */
export function resolveSupportedLocale<L extends string>(
  tag: string,
  supported: readonly L[],
  fallback: L,
): L {
  const wanted = tag.trim().toLowerCase();
  if (!wanted) return fallback;
  const exact = supported.find((locale) => locale.toLowerCase() === wanted);
  if (exact) return exact;
  const base = wanted.split("-")[0];
  const sameBase = supported.find((locale) => locale.toLowerCase().split("-")[0] === base);
  return sameBase ?? fallback;
}
