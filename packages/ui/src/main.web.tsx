// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { createWebPlatform, mountApp } from "./index";

mountApp(document.getElementById("root")!, createWebPlatform());
