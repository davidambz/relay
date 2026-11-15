// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * Fullscreen for one element (the player container, not the bare <video>,
 * so the custom controls stay visible). Tracks fullscreenchange so Esc or
 * the OS leaving fullscreen keeps the button state honest.
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const update = () => setIsFullscreen(document.fullscreenElement !== null && document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, [ref]);

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await ref.current?.requestFullscreen();
      }
    } catch (error) {
      console.warn("Fullscreen request failed", error);
    }
  }, [ref]);

  return { isFullscreen, toggle };
}
