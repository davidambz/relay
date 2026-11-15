// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { act, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { FloatingPlayer } from "./FloatingPlayer";
import { FLOATING_WINDOW_NAME, useChildWindow } from "./useChildWindow";
import type { VolumeControls } from "./useVolume";

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

function Harness({ onReturn, onClosed }: { onReturn: () => void; onClosed: () => void }) {
  const [open, setOpen] = useState(true);
  const container = useChildWindow(open, onClosed);
  return (
    <>
      <button onClick={() => setOpen(false)}>shut</button>
      {container && <FloatingPlayer container={container} stream={null} audio={audio} onReturn={onReturn} onLeave={() => {}} />}
    </>
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
