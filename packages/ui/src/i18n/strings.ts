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
    qualityDetail: string;
    qualityDetailHint: string;
    qualityMotion: string;
    qualityMotionHint: string;
    back: string;
    start: string;
    starting: string;
    captureFailed: string;
  };
  live: {
    previewLabel: string;
    codeLabel: string;
    copy: string;
    copied: string;
    viewersLabel: string;
    sourceLabel: string;
    stop: string;
    codePending: string;
    startFailed: string;
    retry: string;
    reconnecting: string;
    viewersOf: (count: number, max: number) => string;
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
  };
}
