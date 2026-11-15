// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

// Tiny JSON key-value file in userData (ICE servers, viewer limit,
// preferences). Writes go through a temp file + rename so a crash
// mid-write can't leave a truncated settings file.

let cache: Record<string, unknown> | null = null;

function filePath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function load(): Record<string, unknown> {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath(), "utf8"));
    // Valid JSON that isn't an object (null, an array, a number) would
    // make every lookup throw; treat it like a missing file.
    cache = isPlainObject(parsed) ? parsed : {};
  } catch {
    cache = {};
  }
  return cache;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function storeGet(key: string): unknown {
  return load()[key];
}

export function storeSet(key: string, value: unknown) {
  const data = { ...load(), [key]: value };
  const target = filePath();
  const temp = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, target);
  cache = data;
}
