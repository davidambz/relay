// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { act, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { FloatingPlayer } from "./FloatingPlayer";
import { FLOATING_WINDOW_NAME, useChildWindow } from "./useChildWindow";
import type { VolumeControls } from "./useVolume";
import type { Platform } from "@relay/core";
import { PlatformContext } from "../platform/PlatformContext";
import { fakePlatform } from "../test/fakePlatform";

const audio: VolumeControls = { volume: 1, muted: false, setVolume: () => {}, setMuted: () => {}, toggleMuted: vi.fn() };

// jsdom can't open real windows; an iframe gives a genuine second document
// in the same JS context, which is exactly what window.open gives in Electron.
function fakeChildWindow() {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  const child = frame.contentWindow!;
  const close = vi.fn();
  Object.defineProperty(child, "close", { value: close });
  return { child, close };
}

function Harness({ onReturn, onClosed, platform = fakePlatform() }: { onReturn: () => void; onClosed: () => void; platform?: Platform }) {
  const [open, setOpen] = useState(true);
  const container = useChildWindow(open, onClosed);
  return (
    <PlatformContext.Provider value={platform}>
      <button onClick={() => setOpen(false)}>shut</button>
      {container && <FloatingPlayer container={container} stream={null} audio={audio} onReturn={onReturn} />}
    </PlatformContext.Provider>
  );
}

describe("useChildWindow + FloatingPlayer", () => {
  it("opens the named window, copies styles and renders the mini player into it", () => {
    const style = document.createElement("style");
    style.textContent = ".x { color: red }";
    document.head.appendChild(style);
    const { child } = fakeChildWindow();
    const open = vi.spyOn(window, "open").mockReturnValue(child);
    const onReturn = vi.fn();

    render(<Harness onReturn={onReturn} onClosed={() => {}} />);

    expect(open).toHaveBeenCalledWith("", FLOATING_WINDOW_NAME);
    expect(child.document.head.textContent).toContain(".x { color: red }");
    const back = child.document.querySelector('button[aria-label="Back to the main window (P)"]') as HTMLButtonElement;
    fireEvent.click(back);
    expect(onReturn).toHaveBeenCalled();
    fireEvent.keyDown(child, { key: "m" });
    expect(audio.toggleMuted).toHaveBeenCalled();
  });

  it("shows its controls only while hovered, and has no leave button", () => {
    const { child } = fakeChildWindow();
    vi.spyOn(window, "open").mockReturnValue(child);
    const onReturn = vi.fn();
    render(<Harness onReturn={onReturn} onClosed={() => {}} />);
    const root = child.document.querySelector("[data-chrome]") as HTMLElement;
    expect(root.dataset.chrome).toBe("hidden");
    fireEvent.pointerEnter(root);
    expect(root.dataset.chrome).toBe("shown");
    fireEvent.pointerLeave(root);
    expect(root.dataset.chrome).toBe("hidden");
    expect(child.document.querySelector('input[type="range"]')).not.toBeNull();
    expect(child.document.querySelector('button[aria-label="Leave"]')).toBeNull();
    fireEvent.doubleClick(child.document.querySelector("video")!);
    expect(onReturn).toHaveBeenCalled();
  });

  it("follows the shell's hover tracking when it has one", () => {
    const { child } = fakeChildWindow();
    vi.spyOn(window, "open").mockReturnValue(child);
    let report: (hovered: boolean) => void = () => {};
    const platform = fakePlatform({
      onFloatingHover: (listener) => {
        report = listener;
        return () => {};
      },
    });
    render(<Harness onReturn={() => {}} onClosed={() => {}} platform={platform} />);
    const root = child.document.querySelector("[data-chrome]") as HTMLElement;
    // Pointer events are ignored: Windows doesn't send them over the grip.
    fireEvent.pointerEnter(root);
    expect(root.dataset.chrome).toBe("hidden");
    act(() => report(true));
    expect(root.dataset.chrome).toBe("shown");
    act(() => report(false));
    expect(root.dataset.chrome).toBe("hidden");
  });

  it("closes the child when no longer open, without reporting it as user-closed", () => {
    const { child, close } = fakeChildWindow();
    vi.spyOn(window, "open").mockReturnValue(child);
    const onClosed = vi.fn();
    const { getByText } = render(<Harness onReturn={() => {}} onClosed={onClosed} />);
    fireEvent.click(getByText("shut"));
    expect(close).toHaveBeenCalled();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it("reports when the user closes the window", () => {
    const { child } = fakeChildWindow();
    vi.spyOn(window, "open").mockReturnValue(child);
    const onClosed = vi.fn();
    render(<Harness onReturn={() => {}} onClosed={onClosed} />);
    act(() => {
      child.dispatchEvent(new Event("pagehide"));
    });
    expect(onClosed).toHaveBeenCalled();
  });

  it("gives up cleanly when the window can't be opened", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const onClosed = vi.fn();
    render(<Harness onReturn={() => {}} onClosed={onClosed} />);
    expect(onClosed).toHaveBeenCalled();
  });
});
