// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { resolveSupportedLocale } from "@relay/core";
import type { Strings } from "./strings";
import { en } from "./locales/en";
import { ptBR } from "./locales/pt-BR";

export type { Strings } from "./strings";

export const LOCALES = { en, "pt-BR": ptBR } satisfies Record<string, Strings>;
export type Locale = keyof typeof LOCALES;
export const SUPPORTED_LOCALES = Object.keys(LOCALES) as Locale[];

export function resolveLocale(tag: string): Locale {
  return resolveSupportedLocale(tag, SUPPORTED_LOCALES, "en");
}
