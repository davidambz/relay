// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { LogFn } from "@relay/core";

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Sends the page's warnings, errors and uncaught failures to the log
 * file too (they still reach the console). Main redacts every line.
 */
export function forwardPageErrors(log: LogFn) {
  for (const level of ["warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      log({ level, scope: "page", message: args.map(describe).join(" ") });
    };
  }
  window.addEventListener("error", (event) =>
    log({ level: "error", scope: "page", message: `Uncaught: ${describe(event.error ?? event.message)}` }),
  );
  window.addEventListener("unhandledrejection", (event) =>
    log({ level: "error", scope: "page", message: `Unhandled rejection: ${describe(event.reason)}` }),
  );
}
