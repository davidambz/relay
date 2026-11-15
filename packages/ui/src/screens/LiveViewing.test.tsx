// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Platform } from "@relay/core";
import { FakeNetwork, FakeStream } from "@relay/core/testing";
import { PeerFactoryContext } from "../session/PeerFactoryContext";
import { PlatformContext } from "../platform/PlatformContext";
import { fakePlatform } from "../test/fakePlatform";
import { Live } from "./Live";
import { Viewing } from "./Viewing";

const fakeStream = { getVideoTracks: () => [], getAudioTracks: () => [], getTracks: () => [] } as unknown as MediaStream;

function renderWith(network: FakeNetwork, ui: React.ReactElement, platform: Platform = fakePlatform()) {
  return render(
    <PlatformContext.Provider value={platform}>
      <PeerFactoryContext.Provider value={network.factory}>{ui}</PeerFactoryContext.Provider>
    </PlatformContext.Provider>,
  );
}

describe("broadcasting and watching", () => {
  it("shows the code, then counts a viewer that joins with it", async () => {
    const network = new FakeNetwork();
    const host = renderWith(
      network,
      <Live
        broadcast={{ stream: fakeStream, sourceName: "Monitor 1", quality: { resolution: "native", fps: 60 } }}
        onStop={() => {}}
        onSourceEnded={() => {}}
        onRetry={() => {}}
        onQualityChange={() => {}}
      />,
    );
    const code = await within(host.container).findByText(/^[A-Z2-9]{6}$/);
    expect(within(host.container).getByText("0")).toBeInTheDocument();
    expect(host.container.querySelectorAll(".lamp[data-lit]")).toHaveLength(0);

    const onEnded = vi.fn();
    const viewer = renderWith(network, <Viewing code={code.textContent!} onLeave={() => {}} onEnded={onEnded} />);
    expect(within(viewer.container).getByRole("status")).toHaveTextContent(`Connecting to ${code.textContent}`);

    expect(await within(host.container).findByText("1")).toBeInTheDocument();
    // One lamp per connected viewer, with no fixed row of seats.
    expect(host.container.querySelectorAll(".lamp")).toHaveLength(1);
    await act(async () => {});
    expect(within(viewer.container).queryByRole("status")).not.toBeInTheDocument();
    expect(onEnded).not.toHaveBeenCalled();
  });

  it("tells the viewer when the code doesn't exist", async () => {
    const network = new FakeNetwork();
    const onEnded = vi.fn();
    renderWith(network, <Viewing code="ABC234" onLeave={() => {}} onEnded={onEnded} />);
    await vi.waitFor(() => expect(onEnded).toHaveBeenCalledWith("not-found"));
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("switches to another source mid-broadcast, keeping the code and the viewer", async () => {
    const network = new FakeNetwork();
    const fakeTrack = (kind: string, id: string) =>
      ({ kind, id, stop: vi.fn(), addEventListener: () => {}, removeEventListener: () => {}, applyConstraints: async () => {} }) as unknown as MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };
    const oldVideo = fakeTrack("video", "old");
    const newVideo = fakeTrack("video", "new");
    const live = new FakeStream("live", [oldVideo]);
    const captureSource = vi.fn(async () => new FakeStream("next", [newVideo]) as unknown as MediaStream);
    const platform = fakePlatform({
      listSources: async () => [{ id: "window:2:0", kind: "screen", name: "Second", thumbnail: "" }],
      captureSource,
    });
    const host = renderWith(
      network,
      <Live
        broadcast={{ stream: live as unknown as MediaStream, sourceName: "Monitor 1", quality: { resolution: "native", fps: 60 } }}
        onStop={() => {}}
        onSourceEnded={() => {}}
        onRetry={() => {}}
        onQualityChange={() => {}}
      />,
      platform,
    );
    const code = (await within(host.container).findByText(/^[A-Z2-9]{6}$/)).textContent!;
    const onEnded = vi.fn();
    renderWith(network, <Viewing code={code} onLeave={() => {}} onEnded={onEnded} />);
    await within(host.container).findByText("1");

    fireEvent.click(within(host.container).getByRole("button", { name: /Change source/ }));
    fireEvent.click(await within(host.container).findByRole("radio", { name: /Monitor 1/ }));
    fireEvent.click(within(host.container).getByRole("button", { name: "Broadcast this source" }));

    expect(await within(host.container).findByText(code)).toBeInTheDocument();
    expect(captureSource).toHaveBeenCalledWith("window:2:0", expect.objectContaining({ audio: false }));
    expect(live.getTracks()).toEqual([newVideo]);
    expect(oldVideo.stop).toHaveBeenCalled();
    expect(newVideo.stop).not.toHaveBeenCalled();
    const viewerCall = network.peers.get(`relay-tenno-v1-${code}`)!.calls[0];
    expect(viewerCall.sender.replaced).toEqual([newVideo]);
    expect(within(host.container).getByText("1")).toBeInTheDocument();
    expect(onEnded).not.toHaveBeenCalled();
  });
});
