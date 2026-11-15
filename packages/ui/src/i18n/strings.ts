// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

export interface Strings {
  app: {
    statusIdle: string;
    statusLive: string;
  };
  home: {
    broadcastLabel: string;
    broadcastTitle: string;
    broadcastDescription: string;
    broadcastButton: string;
    watchLabel: string;
    watchTitle: string;
    watchDescription: string;
    watchButton: string;
  };
  picker: {
    sourceLabel: string;
    screens: string;
    windows: string;
    refresh: string;
    loading: string;
    emptyScreens: string;
    emptyWindows: string;
    loadFailed: string;
    monitorName: (index: number) => string;
    qualityLabel: string;
    back: string;
    start: string;
    starting: string;
    /** Picking a new source for a live broadcast. */
    switchTo: string;
    switching: string;
    cancelSwitch: string;
    captureFailed: string;
  };
  quality: {
    resolutionLabel: string;
    fpsLabel: string;
    native: string;
    fps60Hint: string;
    fps30Hint: string;
    applyFailed: string;
    audioLabel: string;
    audioDescription: string;
  };
  live: {
    previewLabel: string;
    changeSource: string;
    switchingNotice: string;
    switchFailed: string;
    codeLabel: string;
    copy: string;
    copied: string;
    viewersLabel: string;
    sourceLabel: string;
    qualityLabel: string;
    stop: string;
    codePending: string;
    startFailed: string;
    retry: string;
    reconnecting: string;
    /** The viewer readout: just the count, or "N of M" when a cap is configured. */
    viewersCount: (count: number, max?: number) => string;
    noViewersYet: string;
    sourceEnded: string;
  };
  watch: {
    codeLabel: string;
    codeHint: string;
    codeInvalid: string;
    back: string;
    watch: string;
    ended: string;
    full: string;
    notFound: string;
    timeout: string;
    network: string;
  };
  updates: {
    heading: string;
    currentVersion: (version: string) => string;
    check: string;
    checking: string;
    upToDate: string;
    available: (version: string) => string;
    updateNow: string;
    installing: (version: string) => string;
    failed: string;
  };
  viewing: {
    label: string;
    connecting: (code: string) => string;
    leave: string;
    mute: string;
    unmute: string;
    volume: string;
    fullscreen: string;
    exitFullscreen: string;
    miniPlayer: string;
    returnToMain: string;
    dragMiniPlayer: string;
  };
}
