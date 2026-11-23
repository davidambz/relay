// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import { mountApp } from "@relay/ui";
import { forwardPageErrors } from "./pageErrors";
import { createDesktopPlatform } from "./platform";

const platform = createDesktopPlatform();
forwardPageErrors((entry) => platform.log?.(entry));
mountApp(document.getElementById("root")!, platform);
