// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Strings } from "../strings";

export const en: Strings = {
  app: {
    statusIdle: "Standby",
    statusLive: "On air",
  },
  home: {
    broadcastLabel: "Broadcast",
    broadcastTitle: "Share your screen",
    broadcastDescription: "Pick a monitor or a window and get a code for whoever is going to watch.",
    broadcastButton: "Choose source",
    watchLabel: "Watch",
    watchTitle: "Watch a broadcast",
    watchDescription: "Type the 6-character code the person sharing gave you.",
    watchButton: "Enter code",
  },
  picker: {
    sourceLabel: "Source",
    screens: "Monitors",
    windows: "Windows",
    refresh: "Refresh",
    loading: "Looking for sources…",
    emptyScreens: "No monitors found.",
    emptyWindows: "No open windows found.",
    loadFailed: "Couldn't list the available sources.",
    monitorName: (index) => `Monitor ${index}`,
    qualityLabel: "Quality",
    qualityDetail: "Sharpness",
    qualityDetailHint: "Text and code",
    qualityMotion: "Smoothness",
    qualityMotionHint: "Games and video",
    back: "Back",
    start: "Start broadcast",
    starting: "Starting…",
    captureFailed: "Couldn't capture this source. Try refreshing the list and picking it again.",
  },
  live: {
    previewLabel: "Preview",
    codeLabel: "Code",
    copy: "Copy",
    copied: "Copied",
    viewersLabel: "Viewers",
    sourceLabel: "Source",
    stop: "Stop broadcast",
    connectionPending: "Viewer connections arrive in the next build.",
    sourceEnded: "The shared window was closed, so the broadcast ended.",
  },
  watch: {
    codeLabel: "Broadcast code",
    codeHint: "6 characters, no 0, O, 1 or I.",
    codeInvalid: "That code isn't valid. Check it and try again.",
    back: "Back",
    watch: "Watch",
    connectionPending: "Watching arrives in the next build.",
  },
};
