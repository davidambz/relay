// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { videoProfileFor } from "./quality";

describe("videoProfileFor", () => {
  it("keeps text legible in sharpness mode and motion fluid in smoothness mode", () => {
    expect(videoProfileFor("detail")).toEqual({ frameRate: { ideal: 30, max: 30 }, degradationPreference: "maintain-resolution" });
    expect(videoProfileFor("motion")).toEqual({ frameRate: { ideal: 60, max: 60 }, degradationPreference: "maintain-framerate" });
  });
});
