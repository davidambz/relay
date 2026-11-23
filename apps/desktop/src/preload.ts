// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { IPC, type RelayDesktopApi } from "./shared/api";
import type { Theme, UpdateStatus } from "@relay/core";

// Sync values the main process passes through additionalArguments, so the
// renderer has them at startup without an extra round trip.
function argValue(name: string): string | undefined {
  const prefix = `--relay-${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const api: RelayDesktopApi = {
  appVersion: argValue("version") ?? "0.0.0",
  instance: { number: Number(argValue("instance") ?? "1") },
  audioAvailable: argValue("audio") === "1",
  audioStart: (sourceId) => ipcRenderer.invoke(IPC.audioStart, sourceId),
  audioStop: (captureId) => ipcRenderer.invoke(IPC.audioStop, captureId),
  packaged: argValue("packaged") === "1",
  updateGetStatus: () => ipcRenderer.invoke(IPC.updateGetStatus),
  updateCheck: () => ipcRenderer.invoke(IPC.updateCheck),
  updateApply: () => ipcRenderer.invoke(IPC.updateApply),
  onUpdateStatus(listener) {
    const handler = (_event: IpcRendererEvent, status: UpdateStatus) => listener(status);
    ipcRenderer.on(IPC.updateStatus, handler);
    return () => ipcRenderer.removeListener(IPC.updateStatus, handler);
  },
  setSession: (session) => ipcRenderer.send(IPC.session, session),
  onQuitRequest(listener) {
    const handler = () => listener();
    ipcRenderer.on(IPC.quitRequest, handler);
    return () => ipcRenderer.removeListener(IPC.quitRequest, handler);
  },
  answerQuit: (confirmed) => ipcRenderer.send(IPC.quitAnswer, confirmed),
  listSources: () => ipcRenderer.invoke(IPC.listSources),
  chooseSource: (id) => ipcRenderer.invoke(IPC.chooseSource, id),
  getTheme: () => ipcRenderer.invoke(IPC.getTheme),
  onThemeChange(listener) {
    const handler = (_event: IpcRendererEvent, theme: Theme) => listener(theme);
    ipcRenderer.on(IPC.themeChanged, handler);
    return () => ipcRenderer.removeListener(IPC.themeChanged, handler);
  },
  getLocale: () => ipcRenderer.invoke(IPC.getLocale),
  storeGet: (key) => ipcRenderer.invoke(IPC.storeGet, key),
  storeSet: (key, value) => ipcRenderer.invoke(IPC.storeSet, key, value),
  copyText: (text) => ipcRenderer.invoke(IPC.copyText, text),
  log: (entry) => ipcRenderer.send(IPC.log, entry),
  openLogFolder: () => ipcRenderer.invoke(IPC.openLogFolder),
  onFloatingHover(listener) {
    const handler = (_event: IpcRendererEvent, hovered: boolean) => listener(hovered);
    ipcRenderer.on(IPC.floatingHover, handler);
    return () => ipcRenderer.removeListener(IPC.floatingHover, handler);
  },
};

contextBridge.exposeInMainWorld("relay", api);

// MessagePorts can't cross contextBridge; forward them to the page with
// window.postMessage, the pattern Electron documents for isolated worlds.
ipcRenderer.on(IPC.audioPort, (event) => {
  window.postMessage({ type: "relay-audio-port" }, "*", event.ports);
});
