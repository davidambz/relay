// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { App } from "@capacitor/app";
import { mountApp } from "@relay/ui";
import { createMobilePlatform } from "./platform";

const info = await App.getInfo().catch(() => ({ version: "0.0.0" }));
mountApp(document.getElementById("root")!, createMobilePlatform(info.version));
