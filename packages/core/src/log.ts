// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

// Diagnostics log: what happened to sessions and connections, for when
// something goes wrong on someone's PC. Shells that keep a log file
// (Platform.log) get entries from the sessions and the UI; the rules for
// what never goes in one live here, so every shell applies the same.
//
// Never logged: picture, sound, window titles, IP addresses, TURN
// credentials, or a full share code (anyone holding one can watch).

export type LogLevel = "info" | "warn" | "error";

export type LogValue = string | number | boolean | null;

export interface LogEntry {
  level: LogLevel;
  /** Where it comes from: "host", "viewer", "updates", "app"... */
  scope: string;
  message: string;
  data?: Record<string, LogValue | undefined>;
}

export type LogFn = (entry: LogEntry) => void;

/** "ABC234" → "ABC•••": enough to tell sessions apart, not to join one. */
export function maskCode(code: string): string {
  return `${code.slice(0, 3)}•••`;
}

const PEER_ID = /relay-tenno-v1-([A-Z2-9]{3})[A-Z2-9]{3}/g;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
// Full and compressed forms ("fe80::1", "2001:db8::8a2e:370:7334"). It
// must hold a hex letter or "::", so clock times ("10:00:00") stay.
const IPV6 = /(?<![\w:.])(?=[0-9a-f:]*(?:[a-f]|::))[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}(?![\w:])/gi;
const TURN_SECRET = /("?(?:credential|password|username)"?\s*[:=]\s*)"?[^",}\s]+"?/gi;

/** Takes out share codes, IP addresses and TURN credentials from free text. */
export function redactLogText(text: string): string {
  return text
    .replace(PEER_ID, "relay-tenno-v1-$1•••")
    .replace(TURN_SECRET, "$1•••")
    .replace(IPV4, "•.•.•.•")
    .replace(IPV6, "•:•");
}

const MAX_MESSAGE = 1000;
const MAX_FIELDS = 24;

/** One line of the log file: time, level, scope, message, then key=value. */
export function formatLogLine(time: Date, entry: LogEntry): string {
  const fields = Object.entries(entry.data ?? {})
    .filter(([, value]) => value !== undefined)
    .slice(0, MAX_FIELDS)
    .map(([key, value]) => `${key}=${typeof value === "string" ? JSON.stringify(value) : String(value)}`);
  const message = entry.message.replace(/\s+/g, " ").slice(0, MAX_MESSAGE);
  const line = [time.toISOString(), entry.level.toUpperCase().padEnd(5), `[${entry.scope}]`, message, ...fields].join(" ");
  return redactLogText(line);
}

const LEVELS = new Set<unknown>(["info", "warn", "error"]);

/** Checks an entry that crossed a process boundary; null if it isn't one. */
export function parseLogEntry(value: unknown): LogEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const { level, scope, message, data } = value as Record<string, unknown>;
  if (!LEVELS.has(level) || typeof scope !== "string" || typeof message !== "string") return null;
  const entry: LogEntry = { level: level as LogLevel, scope: scope.slice(0, 40), message: message.slice(0, MAX_MESSAGE) };
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const fields: Record<string, LogValue> = {};
    for (const [key, field] of Object.entries(data).slice(0, MAX_FIELDS)) {
      if (field === null || ["string", "number", "boolean"].includes(typeof field)) {
        fields[key.slice(0, 40)] = typeof field === "string" ? field.slice(0, 200) : (field as LogValue);
      }
    }
    entry.data = fields;
  }
  return entry;
}
