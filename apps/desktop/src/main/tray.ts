// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import { app, Menu, nativeImage, Tray, type NativeImage } from "electron";
import type { SessionKind } from "@relay/core";
import { mainStrings } from "./strings";

/** The app icon: shipped next to the exe when packaged, from build/ in dev. */
function iconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.join(app.getAppPath(), "build", "icon.ico");
}

const LAMP = { r: 0x3f, g: 0xd0, b: 0xc0 }; // the accent, as on the in-app lamps
const RING = { r: 0x11, g: 0x14, b: 0x16 };

/**
 * The icon with a lit indicator lamp in its lower-right corner, the app's
 * one motif for "active" (on air or watching). Drawn into the bitmap at
 * 16 and 32 px so it stays crisp at 100% and 200% scaling.
 */
function withLamp(icon: NativeImage): NativeImage {
  const lit = nativeImage.createEmpty();
  for (const [size, scaleFactor] of [
    [16, 1],
    [32, 2],
  ] as const) {
    const base = icon.resize({ width: size, height: size, quality: "best" });
    const pixels = Buffer.from(base.toBitmap()); // BGRA
    const radius = size * 0.22;
    const center = size - radius - size * 0.02;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const distance = Math.hypot(x + 0.5 - center, y + 0.5 - center);
        if (distance > radius) continue;
        const color = distance > radius - size / 16 ? RING : LAMP;
        const offset = (y * size + x) * 4;
        pixels[offset] = color.b;
        pixels[offset + 1] = color.g;
        pixels[offset + 2] = color.r;
        pixels[offset + 3] = 0xff;
      }
    }
    lit.addRepresentation({ scaleFactor, width: size, height: size, buffer: nativeImage.createFromBitmap(pixels, { width: size, height: size }).toPNG() });
  }
  return lit;
}

export interface RelayTray {
  setSession(session: SessionKind | null): void;
  /** The first time the window goes to the tray, say where Relay went. */
  showStillRunningHint(): void;
  destroy(): void;
}

/**
 * Relay's notification-area icon. Closing the window hides Relay here
 * instead of quitting (see main.ts), so a broadcast keeps going; the
 * icon brings the window back, and its menu is the way to really quit.
 */
export function createTray(options: { onOpen: () => void; onQuit: () => void; hintShown: () => boolean; markHintShown: () => void }): RelayTray {
  const strings = mainStrings();
  const idleIcon = nativeImage.createFromPath(iconPath());
  const activeIcon = idleIcon.isEmpty() ? idleIcon : withLamp(idleIcon);
  const tray = new Tray(idleIcon);
  tray.setToolTip(strings.tooltipIdle);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: strings.trayOpen, click: options.onOpen },
      { type: "separator" },
      { label: strings.trayQuit, click: options.onQuit },
    ]),
  );
  tray.on("click", options.onOpen);

  return {
    setSession(session) {
      tray.setImage(session ? activeIcon : idleIcon);
      tray.setToolTip(
        session === "broadcasting"
          ? strings.tooltipBroadcasting
          : session === "watching"
            ? strings.tooltipWatching
            : strings.tooltipIdle,
      );
    },
    showStillRunningHint() {
      if (options.hintShown()) return;
      options.markHintShown();
      tray.displayBalloon({ title: strings.hintTitle, content: strings.hintBody, iconType: "info" });
    },
    destroy() {
      tray.destroy();
    },
  };
}
