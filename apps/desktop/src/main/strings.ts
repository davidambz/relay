// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { app } from "electron";
import { resolveSupportedLocale } from "@relay/core";

// The few texts the main process shows itself (the tray), in the
// system language like the UI. The UI's own strings live in packages/ui.

interface MainStrings {
  trayOpen: string;
  trayQuit: string;
  tooltipIdle: string;
  tooltipBroadcasting: string;
  tooltipWatching: string;
  hintTitle: string;
  hintBody: string;
}

const STRINGS: Record<"en" | "pt-BR", MainStrings> = {
  en: {
    trayOpen: "Open Relay",
    trayQuit: "Quit",
    tooltipIdle: "Relay",
    tooltipBroadcasting: "Relay: on air",
    tooltipWatching: "Relay: watching",
    hintTitle: "Relay is still running",
    hintBody: "It stays here in the notification area. To close it for good, right-click the icon and choose Quit.",
  },
  "pt-BR": {
    trayOpen: "Abrir o Relay",
    trayQuit: "Sair",
    tooltipIdle: "Relay",
    tooltipBroadcasting: "Relay: no ar",
    tooltipWatching: "Relay: assistindo",
    hintTitle: "O Relay continua aberto",
    hintBody: "Ele fica aqui na área de notificação. Para fechar de vez, clique com o botão direito no ícone e escolha Sair.",
  },
};

export type { MainStrings };

export function mainStrings(): MainStrings {
  const tag = app.getPreferredSystemLanguages()[0] ?? app.getLocale();
  return STRINGS[resolveSupportedLocale(tag, ["en", "pt-BR"] as const, "en")];
}
