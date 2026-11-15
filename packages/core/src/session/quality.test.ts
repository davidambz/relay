// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { applyQualityToTrack, isStreamQuality, videoProfileFor } from "./quality";

describe("videoProfileFor", () => {
  it("favours motion at 60 fps and legibility at 30 fps", () => {
    expect(videoProfileFor({ resolution: "native", fps: 60 })).toMatchObject({
      contentHint: "motion",
      degradationPreference: "maintain-framerate",
      constraints: { frameRate: { ideal: 60, max: 60 }, resizeMode: "none" },
    });
    expect(videoProfileFor({ resolution: "native", fps: 30 })).toMatchObject({
      contentHint: "detail",
      degradationPreference: "maintain-resolution",
      constraints: { frameRate: { ideal: 30, max: 30 } },
    });
  });

  it("caps height (never upscales) for fixed resolutions", () => {
    expect(videoProfileFor({ resolution: "720", fps: 60 }).constraints).toEqual({
      frameRate: { ideal: 60, max: 60 },
      height: { max: 720 },
      resizeMode: "crop-and-scale",
    });
    expect(videoProfileFor({ resolution: "native", fps: 60 }).constraints).not.toHaveProperty("height");
  });

  it("scales the bitrate with pixels and frame rate", () => {
    const scale = (resolution: "720" | "1080" | "1440", fps: 30 | 60) => videoProfileFor({ resolution, fps }).bitrateScale;
    expect(scale("1080", 60)).toBe(1);
    expect(scale("720", 60)).toBeLessThan(scale("1080", 60));
    expect(scale("1440", 60)).toBeGreaterThan(scale("1080", 60));
    expect(scale("1080", 30)).toBeLessThan(scale("1080", 60));
  });
});

describe("isStreamQuality", () => {
  it("accepts only known resolutions and frame rates", () => {
    expect(isStreamQuality({ resolution: "1080", fps: 60 })).toBe(true);
    expect(isStreamQuality({ resolution: "4k", fps: 60 })).toBe(false);
    expect(isStreamQuality({ resolution: "1080", fps: 144 })).toBe(false);
    expect(isStreamQuality(null)).toBe(false);
  });
});

describe("applyQualityToTrack", () => {
  it("sets the content hint and applies the constraints", async () => {
    const track = { contentHint: "", applyConstraints: vi.fn(async () => {}) } as unknown as MediaStreamTrack;
    await applyQualityToTrack(track, { resolution: "720", fps: 30 });
    expect(track.contentHint).toBe("detail");
    expect(track.applyConstraints).toHaveBeenCalledWith(expect.objectContaining({ height: { max: 720 } }));
  });
});
