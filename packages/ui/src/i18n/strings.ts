// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

export interface Strings {
  app: {
    statusIdle: string;
    statusLive: string;
    statusWatching: string;
    statusLiveWatching: string;
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
    /** The dialog's title when starting a broadcast. */
    title: string;
    /** The dialog's title when picking a new source mid-broadcast. */
    switchTitle: string;
    streamingLabel: string;
    change: string;
    cancel: string;
    back: string;
    start: string;
    starting: string;
    /** Picking a new source for a live broadcast. */
    switchTo: string;
    switching: string;
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
  dialog: {
    close: string;
  };
  /** Asked before stopping the broadcast from the stage. */
  stopLive: {
    title: string;
    message: string;
    detail: string;
    confirm: string;
    cancel: string;
  };
  /** Asked before leaving a watched broadcast. */
  leaveLive: {
    title: string;
    message: (code: string) => string;
    detail: string;
    confirm: string;
    cancel: string;
  };
  /** Asked when quitting the app (e.g. from the tray) mid-broadcast. */
  quitWhileLive: {
    title: string;
    message: string;
    detail: string;
    confirm: string;
    cancel: string;
  };
  /** The stage: the tile in focus, the strip of the others, the control bar. */
  stage: {
    codeLabel: string;
    copy: string;
    copied: string;
    codePending: string;
    viewersLabel: string;
    /** The viewer readout: just the count, or "N of M" when a cap is configured. */
    viewersCount: (count: number, max?: number) => string;
    /** The person's own tile. */
    yourTile: (sourceName: string) => string;
    onAir: string;
    /** On the big picture while its sound is off. */
    muted: string;
    tilesLabel: string;
    showTile: (name: string) => string;
    inMiniPlayer: string;
    startFailed: string;
    retry: string;
    reconnecting: string;
    switchFailed: string;
    sourceEnded: string;
    /** A watched broadcast went away: its code, then why. */
    viewerEnded: (code: string, reason: string) => string;
    dismiss: string;
    addWatch: string;
    goLive: string;
    switchSource: string;
    settings: string;
    settingsTitle: string;
    soundOn: string;
    soundOff: string;
    stop: string;
    leave: string;
    controlsLabel: string;
    hideStrip: string;
    /** The strip is hidden: show the N other broadcasts. */
    showStrip: (count: number) => string;
  };
  watch: {
    codeLabel: string;
    codeHint: string;
    codeInvalid: string;
    ownCode: string;
    title: string;
    cancel: string;
    watch: string;
    connecting: string;
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
    connecting: (code: string) => string;
    mute: string;
    unmute: string;
    volume: string;
    fullscreen: string;
    exitFullscreen: string;
    miniPlayer: string;
    returnToMain: string;
  };
}
