// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../i18n/I18nProvider";
import { PlatformContext } from "../platform/PlatformContext";
import { fakePlatform } from "../test/fakePlatform";
import type { HeaderStatus } from "../navigation";
import { Header } from "./Header";

function renderHeader(status: HeaderStatus, onReturnToLive?: () => void) {
  return render(
    <PlatformContext.Provider value={fakePlatform()}>
      <I18nProvider>
        <Header status={status} onReturnToLive={onReturnToLive} />
      </I18nProvider>
    </PlatformContext.Provider>,
  );
}

describe("Header", () => {
  it.each([
    ["idle", "Standby", "false"],
    ["live", "On air", "true"],
    ["watching", "Watching", "true"],
    ["live-watching", "On air · Watching", "true"],
  ] as const)("shows %s as %s, lamp lit: %s", async (status, label, lit) => {
    const { container } = renderHeader(status);
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(container.querySelector(".lamp")?.getAttribute("data-lit")).toBe(lit);
  });

  it("leads back to the broadcast when on air from another screen", async () => {
    const onReturnToLive = vi.fn();
    renderHeader("live", onReturnToLive);
    fireEvent.click(await screen.findByRole("button", { name: "On air. Back to your broadcast" }));
    expect(onReturnToLive).toHaveBeenCalled();
  });
});
