// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Platform } from "@relay/core";
import { FakeNetwork, FakeStream } from "@relay/core/testing";
import { App } from "./App";
import { I18nProvider } from "./i18n/I18nProvider";
import { PlatformContext } from "./platform/PlatformContext";
import { PeerFactoryContext } from "./session/PeerFactoryContext";
import { fakePlatform } from "./test/fakePlatform";

beforeAll(() => {
  // jsdom has no MediaStream; the app only passes it through.
  globalThis.MediaStream ??= class {} as unknown as typeof MediaStream;
});

function fakeTrack(kind = "video", id = kind) {
  return {
    kind,
    id,
    contentHint: "",
    enabled: true,
    stop: vi.fn(),
    addEventListener: () => {},
    removeEventListener: () => {},
    applyConstraints: async () => {},
  } as unknown as MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };
}

function renderApp(network: FakeNetwork, overrides: Partial<Platform> = {}) {
  const track = fakeTrack();
  const setSession = vi.fn();
  const captureSource = vi.fn(async () => new FakeStream("live", [track]) as unknown as MediaStream);
  const platform = fakePlatform({
    listSources: async () => [
      { id: "screen:1:0", kind: "screen", name: "Screen 1", thumbnail: "data:," },
      { id: "screen:2:0", kind: "screen", name: "Screen 2", thumbnail: "data:," },
    ],
    captureSource,
    setSession,
    ...overrides,
  });
  const rendered = render(
    <PlatformContext.Provider value={platform}>
      <PeerFactoryContext.Provider value={network.factory}>
        <I18nProvider>
          <App />
        </I18nProvider>
      </PeerFactoryContext.Provider>
    </PlatformContext.Provider>,
  );
  return { track, setSession, captureSource, root: rendered.container, app: within(rendered.container), unmount: rendered.unmount };
}

/** The open dialog (portaled to document.body). */
async function openDialog(name?: string) {
  return within(await screen.findByRole("dialog", name ? { name } : undefined));
}

/** Goes live on Monitor 1 from home or from the stage's bar; returns the code. */
async function goLive(app: ReturnType<typeof within>) {
  const button = app.queryByRole("button", { name: "Go live" }) ?? app.getByRole("button", { name: "Share your screen" });
  fireEvent.click(button);
  const dialog = await openDialog();
  fireEvent.click(await dialog.findByRole("button", { name: /Monitor 1/ }));
  fireEvent.click(dialog.getByRole("button", { name: "Go live" }));
  return (await app.findByText(/^[A-Z2-9]{6}$/)).textContent!;
}

/** Types a code in the watch dialog, from home or from the stage's bar. */
async function watchCode(app: ReturnType<typeof within>, code: string) {
  const button = app.queryByRole("button", { name: "Enter code" }) ?? app.getByRole("button", { name: "Watch a broadcast" });
  fireEvent.click(button);
  const dialog = await openDialog("Watch a broadcast");
  fireEvent.change(dialog.getByLabelText("Broadcast code"), { target: { value: code } });
  fireEvent.click(dialog.getByRole("button", { name: "Watch" }));
  await act(async () => {});
}

describe("the stage", () => {
  it("goes live through the two-step dialog, with its own broadcast as a tile", async () => {
    const network = new FakeNetwork();
    const { app, setSession, captureSource } = renderApp(network);
    fireEvent.click(await app.findByRole("button", { name: "Go live" }));
    const dialog = await openDialog("Share your screen");
    fireEvent.click(await dialog.findByRole("button", { name: /Monitor 2/ }));

    // Step two: what's going out, with a way back to change it.
    expect(dialog.getByText("Monitor 2")).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Change" }));
    fireEvent.click(await dialog.findByRole("button", { name: /Monitor 1/ }));
    fireEvent.click(dialog.getByRole("radio", { name: "720p" }));
    fireEvent.click(dialog.getByRole("button", { name: "Go live" }));

    const code = (await app.findByText(/^[A-Z2-9]{6}$/)).textContent!;
    expect(captureSource).toHaveBeenCalledWith("screen:1:0", expect.objectContaining({ audio: false }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(app.getByText("Monitor 1 (you)")).toBeInTheDocument();
    expect(setSession).toHaveBeenLastCalledWith("broadcasting");
    expect(network.peers.has(`relay-tenno-v1-${code}`)).toBe(true);
  });

  it("shows an error and stays in the dialog when capture fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { app } = renderApp(new FakeNetwork(), {
      captureSource: async () => {
        throw new Error("denied");
      },
    });
    fireEvent.click(await app.findByRole("button", { name: "Go live" }));
    const dialog = await openDialog();
    fireEvent.click(await dialog.findByRole("button", { name: /Monitor 1/ }));
    fireEvent.click(dialog.getByRole("button", { name: "Go live" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent("Couldn't capture this source");
  });

  it("watches several broadcasts at once, switching focus by clicking", async () => {
    const network = new FakeNetwork();
    // Two other people on air, each in their own app.
    const first = renderApp(network);
    const firstCode = await goLive(first.app);
    const second = renderApp(network);
    const secondCode = await goLive(second.app);

    const { app } = renderApp(network);
    await watchCode(app, firstCode);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await first.app.findByText("1")).toBeInTheDocument();
    await watchCode(app, secondCode);
    expect(await second.app.findByText("1")).toBeInTheDocument();

    // The newest is in focus; the first waits in the strip.
    const strip = app.getByRole("group", { name: "Broadcasts" });
    expect(within(strip).getByRole("button", { name: `Show ${firstCode}` })).toBeInTheDocument();
    expect(within(strip).queryByRole("button", { name: `Show ${secondCode}` })).not.toBeInTheDocument();
    fireEvent.click(within(strip).getByRole("button", { name: `Show ${firstCode}` }));
    expect(within(strip).getByRole("button", { name: `Show ${secondCode}` })).toBeInTheDocument();

    // Leaving the one in focus ends only that one.
    fireEvent.click(app.getByRole("button", { name: "Leave this broadcast" }));
    expect(await first.app.findByText("0")).toBeInTheDocument();
    expect(second.app.getByText("1")).toBeInTheDocument();
    expect(app.queryByRole("group", { name: "Broadcasts" })).not.toBeInTheDocument();
  });

  it("won't watch its own broadcast", async () => {
    const { app } = renderApp(new FakeNetwork());
    const mine = await goLive(app);
    fireEvent.click(app.getByRole("button", { name: "Watch a broadcast" }));
    const dialog = await openDialog("Watch a broadcast");
    fireEvent.change(dialog.getByLabelText("Broadcast code"), { target: { value: mine } });
    fireEvent.click(dialog.getByRole("button", { name: "Watch" }));
    expect(dialog.getByRole("alert")).toHaveTextContent("That's your own broadcast's code");
  });

  it("says in the dialog when a code isn't on air, and stays home", async () => {
    const { app, setSession } = renderApp(new FakeNetwork());
    await watchCode(app, "ABC234");
    const dialog = await openDialog("Watch a broadcast");
    expect(await dialog.findByRole("alert")).toHaveTextContent("Nobody is broadcasting with that code");
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(app.getByRole("button", { name: "Go live" })).toBeInTheDocument();
    expect(setSession).toHaveBeenLastCalledWith(null);
  });

  it("keeps broadcasting when a watched broadcast ends, and says which one", async () => {
    const network = new FakeNetwork();
    const theirs = renderApp(network);
    const theirCode = await goLive(theirs.app);
    const mine = renderApp(network);
    const myCode = await goLive(mine.app);
    await watchCode(mine.app, theirCode);
    expect(await theirs.app.findByText("1")).toBeInTheDocument();

    theirs.unmount();

    expect(await mine.app.findByText(`${theirCode}: The broadcast ended.`)).toBeInTheDocument();
    expect(mine.app.getByText(myCode)).toBeInTheDocument();
    expect(mine.setSession).toHaveBeenLastCalledWith("broadcasting");
  });

  it("stops the broadcast from the bar after confirming, back home once nothing runs", async () => {
    const { app, track, setSession } = renderApp(new FakeNetwork());
    const code = await goLive(app);

    // Cancel (or Esc) keeps it on air.
    fireEvent.click(app.getByRole("button", { name: "Stop broadcast" }));
    fireEvent.click((await openDialog("Stop broadcast")).getByRole("button", { name: "Keep broadcasting" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(app.getByText(code)).toBeInTheDocument();
    expect(track.stop).not.toHaveBeenCalled();

    fireEvent.click(app.getByRole("button", { name: "Stop broadcast" }));
    fireEvent.click((await openDialog("Stop broadcast")).getByRole("button", { name: "Stop broadcast" }));
    expect(track.stop).toHaveBeenCalled();
    expect(setSession).toHaveBeenLastCalledWith(null);
    expect(app.getByRole("status")).toHaveTextContent("Standby");
  });

  it("switches the source mid-broadcast, keeping the code and the viewer", async () => {
    const network = new FakeNetwork();
    const oldVideo = fakeTrack("video", "old");
    const newVideo = fakeTrack("video", "new");
    const live = new FakeStream("live", [oldVideo]);
    let calls = 0;
    const host = renderApp(network, {
      captureSource: async () => (calls++ === 0 ? live : new FakeStream("next", [newVideo])) as unknown as MediaStream,
    });
    const code = await goLive(host.app);
    const viewer = renderApp(network);
    await watchCode(viewer.app, code);
    expect(await host.app.findByText("1")).toBeInTheDocument();

    fireEvent.click(host.app.getByRole("button", { name: "Change source" }));
    const dialog = await openDialog("Change source");
    fireEvent.click(await dialog.findByRole("button", { name: /Monitor 2/ }));
    fireEvent.click(dialog.getByRole("button", { name: "Broadcast this source" }));
    await act(async () => {});

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(host.app.getByText(code)).toBeInTheDocument();
    expect(host.app.getByText("Monitor 2 (you)")).toBeInTheDocument();
    expect(live.getTracks()).toEqual([newVideo]);
    expect(oldVideo.stop).toHaveBeenCalled();
    const viewerCall = network.peers.get(`relay-tenno-v1-${code}`)!.calls[0];
    expect(viewerCall.sender.replaced).toEqual([newVideo]);
    expect(host.app.getByText("1")).toBeInTheDocument();
  });
});
