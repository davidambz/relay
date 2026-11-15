// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Platform } from "@relay/core";
import { App } from "./App";
import { I18nProvider } from "./i18n/I18nProvider";
import { PlatformContext } from "./platform/PlatformContext";
import "./styles/global.css";

export { createWebPlatform } from "./platform/web";

/** Mounts the shared Relay UI on top of a shell-specific Platform adapter. */
export function mountApp(element: HTMLElement, platform: Platform) {
  createRoot(element).render(
    <StrictMode>
      <PlatformContext.Provider value={platform}>
        <I18nProvider>
          <App />
        </I18nProvider>
      </PlatformContext.Provider>
    </StrictMode>,
  );
}
