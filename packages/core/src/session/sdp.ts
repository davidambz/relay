// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

const STEREO_PARAMS: Record<string, string> = {
  stereo: "1",
  "sprop-stereo": "1",
  maxaveragebitrate: "128000",
};

/**
 * Turns Opus into full-band stereo music mode in an SDP blob. Must run on
 * BOTH sides: "stereo=1" in the receiver's description is what tells the
 * sender's encoder to actually send stereo, so applying it only on the
 * broadcaster's offer still yields mono. SDPs without Opus pass through.
 */
export function enableOpusStereo(sdp: string): string {
  const lineBreak = sdp.includes("\r\n") ? "\r\n" : "\n";
  const lines = sdp.split(lineBreak);
  const payloadTypes = new Set<string>();
  for (const line of lines) {
    const match = /^a=rtpmap:(\d+) opus\/48000/i.exec(line);
    if (match) payloadTypes.add(match[1]);
  }
  if (payloadTypes.size === 0) return sdp;

  const withFmtp = new Set<string>();
  const updated = lines.map((line) => {
    const match = /^a=fmtp:(\d+) (.*)$/.exec(line);
    if (!match || !payloadTypes.has(match[1])) return line;
    withFmtp.add(match[1]);
    const params = new Map<string, string>();
    for (const pair of match[2].split(";")) {
      const [key, value = ""] = pair.trim().split("=");
      if (key) params.set(key, value);
    }
    for (const [key, value] of Object.entries(STEREO_PARAMS)) params.set(key, value);
    const joined = [...params].map(([key, value]) => `${key}=${value}`).join(";");
    return `a=fmtp:${match[1]} ${joined}`;
  });

  // Opus payloads with no fmtp line at all get one right after their rtpmap.
  const result: string[] = [];
  for (const line of updated) {
    result.push(line);
    const match = /^a=rtpmap:(\d+) opus\/48000/i.exec(line);
    if (match && !withFmtp.has(match[1])) {
      const joined = Object.entries(STEREO_PARAMS)
        .map(([key, value]) => `${key}=${value}`)
        .join(";");
      result.push(`a=fmtp:${match[1]} ${joined}`);
    }
  }
  return result.join(lineBreak);
}
