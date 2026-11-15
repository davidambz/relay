// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from "react";

export const FLOATING_WINDOW_NAME = "relay-floating";

/**
 * Opens a same-origin child window (window.open) while `open` is true and
 * returns a container in it to portal React into. Same JS context as the
 * opener, so MediaStreams and React state carry over with no second
 * connection. The shell decides the window's shape: Electron's main
 * process matches the name in setWindowOpenHandler.
 *
 * Head styles are cloned in so the portal looks like the rest of the app.
 * `onClosed` fires when the user closes the child window themselves.
 */
export function useChildWindow(open: boolean, onClosed: () => void, title = "Relay"): HTMLElement | null {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  // Latest callback without making it an effect dependency: a new
  // callback identity must not close and reopen the window.
  const onClosedRef = useRef(onClosed);
  useEffect(() => {
    onClosedRef.current = onClosed;
  });

  useEffect(() => {
    if (!open) return;
    const child = window.open("", FLOATING_WINDOW_NAME);
    if (!child) {
      onClosedRef.current();
      return;
    }
    const doc = child.document;
    doc.title = title;
    doc.documentElement.lang = document.documentElement.lang;
    const theme = document.documentElement.getAttribute("data-theme");
    if (theme) doc.documentElement.setAttribute("data-theme", theme);
    for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"]')) {
      const clone = node.cloneNode(true) as HTMLElement;
      // A relative href would resolve against about:blank in the child.
      if (clone instanceof HTMLLinkElement) clone.href = (node as HTMLLinkElement).href;
      doc.head.appendChild(clone);
    }
    doc.body.style.margin = "0";
    doc.body.style.background = "#000";
    const root = doc.createElement("div");
    root.style.height = "100vh";
    doc.body.appendChild(root);
    // Publishing the external window's container is the point of this
    // effect (it only exists once window.open has run).
    // oxlint-disable-next-line react/set-state-in-effect
    setContainer(root);

    let closingOurselves = false;
    const handleUnload = () => {
      if (!closingOurselves) onClosedRef.current();
    };
    child.addEventListener("pagehide", handleUnload);

    return () => {
      closingOurselves = true;
      child.removeEventListener("pagehide", handleUnload);
      setContainer(null);
      child.close();
    };
  }, [open, title]);

  return container;
}
