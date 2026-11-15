// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { createContext, useContext } from "react";
import { LOCALES, type Locale, type Strings } from "./index";

interface I18nContextValue {
  locale: Locale;
  t: Strings;
}

// English default so components rendered without a provider (most unit
// tests) still get real strings.
export const I18nContext = createContext<I18nContextValue>({ locale: "en", t: LOCALES.en });

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
