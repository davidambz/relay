// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { createContext, useContext } from "react";
import type { Platform } from "@relay/core";

export const PlatformContext = createContext<Platform | null>(null);

export function usePlatform(): Platform {
  const platform = useContext(PlatformContext);
  if (!platform) {
    throw new Error("usePlatform() needs a <PlatformContext.Provider> above it");
  }
  return platform;
}
