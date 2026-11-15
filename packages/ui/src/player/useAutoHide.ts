// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "react";

export const AUTO_HIDE_MS = 2500;

/**
 * Player chrome visibility: shown on any pointer movement, hidden again
 * after `delay` of stillness. Touch has no hover, so a tap toggles instead.
 * While `pinned` (pointer over the controls, or keyboard focus inside
 * them) it never hides, so nothing vanishes from under the user.
 */
export function useAutoHide(delay = AUTO_HIDE_MS) {
  const [visible, setVisible] = useState(true);
  const [pinned, setPinned] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const arm = useCallback(() => {
    clear();
    timer.current = setTimeout(() => setVisible(false), delay);
  }, [delay]);

  const show = useCallback(() => {
    setVisible(true);
    arm();
  }, [arm]);

  const toggle = useCallback(() => {
    setVisible((current) => {
      if (current) {
        clear();
        return false;
      }
      arm();
      return true;
    });
  }, [arm]);

  // Start the countdown on mount; pinning suspends it.
  useEffect(() => {
    if (pinned) {
      clear();
    } else {
      arm();
    }
    return clear;
  }, [pinned, arm]);

  return { visible: visible || pinned, show, toggle, setPinned };
}
