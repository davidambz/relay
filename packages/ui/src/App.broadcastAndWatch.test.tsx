// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { FakeNetwork, FakeStream } from "@relay/core/testing";
import { App } from "./App";
import { Live } from "./screens/Live";
import { I18nProvider } from "./i18n/I18nProvider";
import { PlatformContext } from "./platform/PlatformContext";
import { PeerFactoryContext } from "./session/PeerFactoryContext";
import { fakePlatform } from "./test/fakePlatform";

beforeAll(() => {
  // jsdom has no MediaStream; the app only passes it through.
  globalThis.MediaStream ??= class {} as unknown as typeof MediaStream;
});

function fakeTrack() {
  return {
    kind: "video",
    id: "video",
    contentHint: "",
    stop: vi.fn(),
    addEventListener: () => {},
    removeEventListener: () => {},
    applyConstraints: async () => {},
  } as unknown as MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };
}

/** Someone else on air on the same network, in their own app. */
async function otherBroadcast(network: FakeNetwork) {
  const theirs = render(
    <PlatformContext.Provider value={fakePlatform()}>
      <PeerFactoryContext.Provider value={network.factory}>
        <I18nProvider>
          <Live
            broadcast={{ stream: new FakeStream("theirs", [fakeTrack()]) as unknown as MediaStream, sourceName: "Monitor 1", quality: { resolution: "native", fps: 60 } }}
            onStop={() => {}}
            onSourceEnded={() => {}}
            onRetry={() => {}}
            onQualityChange={() => {}}
          />
        </I18nProvider>
      </PeerFactoryContext.Provider>
    </PlatformContext.Provider>,
  );
  const code = (await within(theirs.container).findByText(/^[A-Z2-9]{6}$/)).textContent!;
  return { code, container: theirs.container };
}

function renderApp(network = new FakeNetwork()) {
  const track = fakeTrack();
  const setSession = vi.fn();
  const platform = fakePlatform({
    listSources: async () => [{ id: "screen:1:0", kind: "screen", name: "Screen 1", thumbnail: "data:," }],
    captureSource: async () => new FakeStream("live", [track]) as unknown as MediaStream,
    setSession,
  });
  const app = render(
    <PlatformContext.Provider value={platform}>
      <PeerFactoryContext.Provider value={network.factory}>
        <I18nProvider>
          <App />
        </I18nProvider>
      </PeerFactoryContext.Provider>
    </PlatformContext.Provider>,
  );
  return { network, track, setSession, app: within(app.container) };
}

async function goLive(app: ReturnType<typeof within>) {
  fireEvent.click(await app.findByRole("button", { name: "Choose source" }));
  fireEvent.click(await app.findByRole("radio", { name: "Monitor 1" }));
  fireEvent.click(app.getByRole("button", { name: "Start broadcast" }));
  return (await app.findByText(/^[A-Z2-9]{6}$/)).textContent!;
}

describe("broadcasting while watching", () => {
  it("watches someone else's broadcast while still on air", async () => {
    const network = new FakeNetwork();
    const theirs = await otherBroadcast(network);
    const { track, setSession, app } = renderApp(network);
    const mine = await goLive(app);
    expect(mine).not.toBe(theirs.code);

    fireEvent.click(app.getByRole("button", { name: "Watch another broadcast" }));
    fireEvent.change(await app.findByLabelText("Broadcast code"), { target: { value: theirs.code } });
    fireEvent.click(app.getByRole("button", { name: "Watch" }));
    await act(async () => {});

    // They count us as a viewer; we stay on air, not counting ourselves.
    expect(await within(theirs.container).findByText("1")).toBeInTheDocument();
    expect(app.getByRole("status")).toHaveTextContent("On air · Watching");
    expect(setSession).toHaveBeenLastCalledWith("broadcasting");
    expect(track.stop).not.toHaveBeenCalled();
    expect(network.peers.has(`relay-tenno-v1-${mine}`)).toBe(true);

    // The header switches between the two screens; neither session ends.
    const views = app.getByRole("radiogroup", { name: "Switch between broadcasts" });
    fireEvent.click(within(views).getByRole("radio", { name: "Your broadcast" }));
    expect(within(app.getByRole("main")).getByText(mine)).toBeVisible();
    expect(app.getByRole("button", { name: "Leave", hidden: true })).not.toBeVisible();
    fireEvent.click(within(views).getByRole("radio", { name: "Watching" }));
    expect(app.getByRole("button", { name: "Leave" })).toBeVisible();
    expect(within(theirs.container).getByText("1")).toBeInTheDocument();

    // Leaving the player ends only the watching; the header then leads
    // back to our broadcast, still under the same code.
    fireEvent.click(app.getByRole("button", { name: "Leave" }));
    expect(await within(theirs.container).findByText("0")).toBeInTheDocument();
    expect(app.queryByRole("radiogroup", { name: "Switch between broadcasts" })).not.toBeInTheDocument();
    fireEvent.click(await app.findByRole("button", { name: /Back to your broadcast/ }));
    expect(within(app.getByRole("main")).getByText(mine)).toBeVisible();
  });

  it("offers the running broadcast on the home screen and stops it from there", async () => {
    const { track, setSession, app } = renderApp();
    await goLive(app);
    fireEvent.click(app.getByRole("button", { name: "Watch another broadcast" }));
    fireEvent.click(await app.findByRole("button", { name: "Back" }));

    expect(await screen.findByText("You're on air")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to broadcast" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop broadcast" }));

    expect(track.stop).toHaveBeenCalled();
    expect(setSession).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("status")).toHaveTextContent("Standby");
  });
});
