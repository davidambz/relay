// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { act, render, screen, within } from "@testing-library/react";
import { FakeNetwork } from "@relay/core/testing";
import { PeerFactoryContext } from "../session/PeerFactoryContext";
import { PlatformContext } from "../platform/PlatformContext";
import { fakePlatform } from "../test/fakePlatform";
import { Live } from "./Live";
import { Viewing } from "./Viewing";

const fakeStream = { getVideoTracks: () => [], getAudioTracks: () => [], getTracks: () => [] } as unknown as MediaStream;

function renderWith(network: FakeNetwork, ui: React.ReactElement) {
  return render(
    <PlatformContext.Provider value={fakePlatform()}>
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
    expect(within(host.container).getByText("0 of 5")).toBeInTheDocument();

    const onEnded = vi.fn();
    const viewer = renderWith(network, <Viewing code={code.textContent!} onLeave={() => {}} onEnded={onEnded} />);
    expect(within(viewer.container).getByRole("status")).toHaveTextContent(`Connecting to ${code.textContent}`);

    expect(await within(host.container).findByText("1 of 5")).toBeInTheDocument();
    await act(async () => {});
    expect(within(viewer.container).queryByRole("status")).not.toBeInTheDocument();
    expect(onEnded).not.toHaveBeenCalled();
  });

  it("tells the viewer when the code doesn't exist", async () => {
    const network = new FakeNetwork();
    const onEnded = vi.fn();
    renderWith(network, <Viewing code="ABC234" onLeave={() => {}} onEnded={onEnded} />);
    await vi.waitFor(() => expect(onEnded).toHaveBeenCalledWith("not-found"));
    expect(screen.queryByText("1 of 5")).not.toBeInTheDocument();
  });
});
