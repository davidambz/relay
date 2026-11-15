// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

// Share codes: what a viewer types to find a broadcast. Six characters
// from an alphabet without the easily-confused 0/O and 1/I, so a code
// read aloud on a call or copied off a phone screen survives the trip.

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

// Namespaces our ids on the public PeerJS cloud server, which other apps
// share. Bump the version suffix on any wire-incompatible protocol change
// so old and new builds can't find each other by accident.
export const PEER_ID_PREFIX = "relay-tenno-v1-";

type RandomSource = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;

const defaultRandom: RandomSource = (bytes) => crypto.getRandomValues(bytes);

export function generateCode(random: RandomSource = defaultRandom): string {
  // 256 is a multiple of the alphabet's 32 symbols, so a plain modulo is
  // unbiased here. Guard it in case the alphabet ever changes size.
  if (256 % CODE_ALPHABET.length !== 0) {
    throw new Error("CODE_ALPHABET length must divide 256 to keep codes unbiased");
  }
  const bytes = random(new Uint8Array(CODE_LENGTH));
  let code = "";
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

/**
 * Cleans whatever the viewer typed or pasted: uppercases and drops spaces
 * and dashes. Characters outside the alphabet are kept on purpose, so
 * isValidCode rejects a mistyped code instead of it being silently
 * "corrected" into someone else's broadcast.
 */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export function isValidCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const char of code) {
    if (!CODE_ALPHABET.includes(char)) return false;
  }
  return true;
}

export function peerIdForCode(code: string): string {
  if (!isValidCode(code)) {
    throw new Error(`Invalid share code: "${code}"`);
  }
  return PEER_ID_PREFIX + code;
}
