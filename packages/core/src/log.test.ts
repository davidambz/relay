// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { formatLogLine, maskCode, parseLogEntry, redactLogText } from "./log";

describe("log", () => {
  it("masks share codes", () => {
    expect(maskCode("ABC234")).toBe("ABC•••");
    expect(redactLogText("Could not connect to peer relay-tenno-v1-QUXET2")).toBe("Could not connect to peer relay-tenno-v1-QUX•••");
  });

  it("takes out IP addresses and TURN credentials", () => {
    expect(redactLogText("candidate 192.168.0.12 and 2001:db8::8a2e:370:7334 and fe80::1")).toBe(
      "candidate •.•.•.• and •:• and •:•",
    );
    expect(redactLogText("at 10:00:00 and 12:30")).toBe("at 10:00:00 and 12:30");
    expect(redactLogText('{"urls":"turn:x","username":"bob","credential":"s3cret"}')).not.toMatch(/bob|s3cret/);
  });

  it("leaves times and versions alone", () => {
    const line = formatLogLine(new Date("2026-11-22T10:00:00.000Z"), {
      level: "info",
      scope: "app",
      message: "Relay 0.1.12 started",
      data: { windows: "10.0.26100", instance: 1, skipped: undefined },
    });
    expect(line).toBe('2026-11-22T10:00:00.000Z INFO  [app] Relay 0.1.12 started windows="10.0.26100" instance=1');
  });

  it("accepts only well-formed entries from another process", () => {
    expect(parseLogEntry({ level: "debug", scope: "x", message: "y" })).toBeNull();
    expect(parseLogEntry("nope")).toBeNull();
    expect(parseLogEntry({ level: "warn", scope: "viewer", message: "m", data: { a: 1, b: { nested: true }, c: "x".repeat(500) } })).toEqual({
      level: "warn",
      scope: "viewer",
      message: "m",
      data: { a: 1, c: "x".repeat(200) },
    });
  });
});
