// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { act, fireEvent, render, screen } from "@testing-library/react";
import { App } from "./App";
import { I18nProvider } from "./i18n/I18nProvider";
import { PlatformContext } from "./platform/PlatformContext";
import { fakePlatform } from "./test/fakePlatform";

function renderWithQuitRequests() {
  let ask: () => Promise<boolean> = async () => false;
  const platform = fakePlatform({
    onQuitRequest: (handler) => {
      ask = handler;
      return () => {};
    },
  });
  render(
    <PlatformContext.Provider value={platform}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </PlatformContext.Provider>,
  );
  return { ask: () => ask() };
}

describe("quitting mid-broadcast", () => {
  it("asks in the app's own dialog and quits on confirm", async () => {
    const { ask } = renderWithQuitRequests();
    await screen.findByText("Standby");
    let answer: Promise<boolean> = Promise.resolve(false);
    act(() => void (answer = ask()));
    expect(await screen.findByRole("dialog", { name: "You're broadcasting" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quit and end broadcast" }));
    await expect(answer).resolves.toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps broadcasting on cancel or Esc", async () => {
    const { ask } = renderWithQuitRequests();
    await screen.findByText("Standby");
    let answer: Promise<boolean> = Promise.resolve(true);
    act(() => void (answer = ask()));
    fireEvent.click(await screen.findByRole("button", { name: "Keep broadcasting" }));
    await expect(answer).resolves.toBe(false);

    act(() => void (answer = ask()));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await expect(answer).resolves.toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
