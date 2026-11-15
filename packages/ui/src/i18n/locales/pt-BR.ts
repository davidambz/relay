// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Strings } from "../strings";

export const ptBR: Strings = {
  app: {
    statusIdle: "Em espera",
    statusLive: "No ar",
  },
  home: {
    broadcastLabel: "Transmitir",
    broadcastTitle: "Compartilhar sua tela",
    broadcastDescription: "Escolha um monitor ou uma janela e receba um código para quem vai assistir.",
    broadcastButton: "Escolher fonte",
    watchLabel: "Assistir",
    watchTitle: "Assistir uma transmissão",
    watchDescription: "Digite o código de 6 caracteres que a pessoa que está transmitindo te passou.",
    watchButton: "Digitar código",
  },
  picker: {
    sourceLabel: "Fonte",
    screens: "Monitores",
    windows: "Janelas",
    refresh: "Atualizar",
    loading: "Procurando fontes…",
    emptyScreens: "Nenhum monitor encontrado.",
    emptyWindows: "Nenhuma janela aberta encontrada.",
    loadFailed: "Não foi possível listar as fontes disponíveis.",
    monitorName: (index) => `Monitor ${index}`,
    qualityLabel: "Qualidade",
    qualityDetail: "Nitidez",
    qualityDetailHint: "Texto e código",
    qualityMotion: "Fluidez",
    qualityMotionHint: "Jogos e vídeo",
    back: "Voltar",
    start: "Iniciar transmissão",
    starting: "Iniciando…",
    captureFailed: "Não foi possível capturar essa fonte. Atualize a lista e escolha de novo.",
  },
  live: {
    previewLabel: "Prévia",
    codeLabel: "Código",
    copy: "Copiar",
    copied: "Copiado",
    viewersLabel: "Espectadores",
    sourceLabel: "Fonte",
    stop: "Parar transmissão",
    connectionPending: "A conexão dos espectadores chega na próxima versão.",
    sourceEnded: "A janela compartilhada foi fechada, então a transmissão acabou.",
  },
  watch: {
    codeLabel: "Código da transmissão",
    codeHint: "6 caracteres, sem 0, O, 1 ou I.",
    codeInvalid: "Esse código não é válido. Confira e tente de novo.",
    back: "Voltar",
    watch: "Assistir",
    connectionPending: "Assistir chega na próxima versão.",
  },
};
