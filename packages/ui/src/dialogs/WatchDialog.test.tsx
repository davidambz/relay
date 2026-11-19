// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WatchDialog } from "./WatchDialog";

describe("WatchDialog", () => {
  it("normalizes typed codes and enables Watch at 6 characters", async () => {
    const user = userEvent.setup();
    render(<WatchDialog onClose={() => {}} onWatch={() => {}} />);
    const input = screen.getByLabelText("Broadcast code");
    await user.type(input, "ab c-23");
    expect(input).toHaveValue("ABC23");
    expect(screen.getByRole("button", { name: "Watch" })).toBeDisabled();
    await user.type(input, "4");
    expect(input).toHaveValue("ABC234");
    expect(screen.getByRole("button", { name: "Watch" })).toBeEnabled();
  });

  it("hands a valid code to onWatch", async () => {
    const user = userEvent.setup();
    const onWatch = vi.fn();
    render(<WatchDialog onClose={() => {}} onWatch={onWatch} />);
    await user.type(screen.getByLabelText("Broadcast code"), "abc234{Enter}");
    expect(onWatch).toHaveBeenCalledWith("ABC234");
  });

  it("rejects codes with look-alike characters", async () => {
    const user = userEvent.setup();
    render(<WatchDialog onClose={() => {}} onWatch={() => {}} />);
    await user.type(screen.getByLabelText("Broadcast code"), "ABC230");
    await user.click(screen.getByRole("button", { name: "Watch" }));
    expect(screen.getByRole("alert")).toHaveTextContent("That code isn't valid");
  });

  it("waits while connecting, then shows why it couldn't, until the code is edited", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<WatchDialog onClose={() => {}} onWatch={() => {}} />);
    await user.type(screen.getByLabelText("Broadcast code"), "ABC234{Enter}");
    rerender(<WatchDialog onClose={() => {}} onWatch={() => {}} connecting />);
    expect(screen.getByRole("button", { name: "Connecting…" })).toBeDisabled();
    rerender(<WatchDialog onClose={() => {}} onWatch={() => {}} error="Nobody is broadcasting with that code." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Nobody is broadcasting");
    await user.type(screen.getByLabelText("Broadcast code"), "{Backspace}5");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Broadcast code")).not.toHaveAttribute("aria-invalid", "true");
  });
});
