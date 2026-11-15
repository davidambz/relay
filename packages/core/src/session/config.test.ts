// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { KeyValueStore } from "../platform";
import { DEFAULT_SESSION_CONFIG, loadSessionConfig } from "./config";
import { maxBitrateForViewers } from "./bitrate";

const storeWith = (value: unknown): KeyValueStore => ({
  get: async <T,>() => value as T,
  set: async () => {},
});

describe("loadSessionConfig", () => {
  it("uses defaults when nothing is stored", async () => {
    expect(await loadSessionConfig(storeWith(undefined))).toEqual(DEFAULT_SESSION_CONFIG);
  });

  it("applies valid overrides", async () => {
    const turn = { urls: "turn:turn.example.com:3478", username: "u", credential: "c" };
    const config = await loadSessionConfig(storeWith({ iceServers: [turn], maxViewers: 3, server: { host: "peer.example.com", secure: true } }));
    expect(config).toEqual({ iceServers: [turn], maxViewers: 3, server: { host: "peer.example.com", secure: true } });
  });

  it("ignores malformed fields individually", async () => {
    const config = await loadSessionConfig(storeWith({ iceServers: "nope", maxViewers: -2, server: { port: 1 } }));
    expect(config).toEqual(DEFAULT_SESSION_CONFIG);
  });
});

describe("maxBitrateForViewers", () => {
  it("steps down as the audience grows", () => {
    expect([1, 2, 3, 4, 5, 8].map(maxBitrateForViewers)).toEqual([6e6, 6e6, 4e6, 4e6, 3e6, 3e6]);
  });
});
