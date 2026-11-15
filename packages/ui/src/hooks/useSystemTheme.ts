// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState } from "react";
import type { Theme } from "@relay/core";
import { usePlatform } from "../platform/PlatformContext";

/**
 * Follows the OS theme reported by the platform and keeps
 * <html data-theme> in sync so tokens.css picks the right palette.
 */
export function useSystemTheme(): Theme {
  const platform = usePlatform();
  const [theme, setTheme] = useState<Theme>(() =>
    window.matchMedia?.("(prefers-color-scheme: dark)").matches === false ? "light" : "dark",
  );

  useEffect(() => {
    let cancelled = false;
    platform
      .getSystemTheme()
      .then((initial) => {
        if (!cancelled) setTheme(initial);
      })
      .catch((error) => console.error("Failed to read the system theme", error));
    const unsubscribe = platform.onSystemThemeChange((next) => {
      if (!cancelled) setTheme(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [platform]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return theme;
}
