// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { enableOpusStereo } from "./sdp";

const OFFER = [
  "v=0",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111 63",
  "a=rtpmap:111 opus/48000/2",
  "a=fmtp:111 minptime=10;useinbandfec=1",
  "a=rtpmap:63 red/48000/2",
  "a=fmtp:63 111/111",
  "",
].join("\r\n");

describe("enableOpusStereo", () => {
  it("adds stereo params to the Opus fmtp line and keeps existing ones", () => {
    const out = enableOpusStereo(OFFER);
    expect(out).toContain("a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=128000");
    expect(out).toContain("a=fmtp:63 111/111");
    expect(out.split("\r\n")).toHaveLength(OFFER.split("\r\n").length);
  });

  it("overrides an existing stereo=0", () => {
    const out = enableOpusStereo(OFFER.replace("useinbandfec=1", "useinbandfec=1;stereo=0"));
    expect(out).toContain("stereo=1;");
    expect(out).not.toContain("stereo=0");
  });

  it("adds an fmtp line when Opus has none", () => {
    const sdp = "m=audio 9 UDP/TLS/RTP/SAVPF 111\na=rtpmap:111 opus/48000/2\n";
    expect(enableOpusStereo(sdp)).toBe(
      "m=audio 9 UDP/TLS/RTP/SAVPF 111\na=rtpmap:111 opus/48000/2\na=fmtp:111 stereo=1;sprop-stereo=1;maxaveragebitrate=128000\n",
    );
  });

  it("leaves SDPs without Opus untouched", () => {
    const video = "m=video 9 UDP/TLS/RTP/SAVPF 96\r\na=rtpmap:96 VP8/90000\r\n";
    expect(enableOpusStereo(video)).toBe(video);
  });
});
