// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { enableOpusStereo, preferVideoCodec, sessionSdpTransform } from "./sdp";

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

describe("preferVideoCodec", () => {
  const VIDEO = [
    "m=video 9 UDP/TLS/RTP/SAVPF 96 97 102 103 45",
    "a=rtpmap:96 VP8/90000",
    "a=rtpmap:97 rtx/90000",
    "a=fmtp:97 apt=96",
    "a=rtpmap:102 H264/90000",
    "a=fmtp:102 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f",
    "a=rtpmap:103 rtx/90000",
    "a=fmtp:103 apt=102",
    "a=rtpmap:45 AV1/90000",
    "",
  ].join("\r\n");

  it("moves the codec and its RTX to the front of the m=video line", () => {
    expect(preferVideoCodec(VIDEO, "h264").split("\r\n")[0]).toBe("m=video 9 UDP/TLS/RTP/SAVPF 102 103 96 97 45");
  });

  it("leaves the SDP alone for a codec it doesn't offer", () => {
    expect(preferVideoCodec(VIDEO, "VP9")).toBe(VIDEO);
  });

  it("composes with Opus stereo in sessionSdpTransform", () => {
    const sdp = "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n" + VIDEO;
    const out = sessionSdpTransform("H264")(sdp);
    expect(out).toContain("stereo=1");
    expect(out).toContain("m=video 9 UDP/TLS/RTP/SAVPF 102 103 96 97 45");
    expect(sessionSdpTransform(undefined)(sdp)).toBe(enableOpusStereo(sdp));
  });
});
