// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nContext } from "./I18nContext";
import { LOCALES, resolveLocale, type Locale } from "./index";
import { usePlatform } from "../platform/PlatformContext";

export function I18nProvider({ children }: { children: ReactNode }) {
  const platform = usePlatform();
  const [locale, setLocale] = useState<Locale>(() => resolveLocale(navigator.language ?? ""));

  useEffect(() => {
    let cancelled = false;
    platform
      .getSystemLocale()
      .then((tag) => {
        if (!cancelled) setLocale(resolveLocale(tag));
      })
      .catch((error) => console.error("Failed to read the system locale", error));
    return () => {
      cancelled = true;
    };
  }, [platform]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({ locale, t: LOCALES[locale] }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
