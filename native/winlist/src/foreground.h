// Relay
// Copyright (C) 2026 David Ambrozio
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

#pragma once

#include <windows.h>

namespace relay {

// The window in the foreground, and whether it covers its whole monitor
// (a game or video in fullscreen, exclusive or borderless).
struct ForegroundInfo {
    HWND hwnd = nullptr;
    DWORD pid = 0;
    bool fullscreen = false;
    RECT monitor = {};  // The monitor it's on, in physical pixels.
};

ForegroundInfo QueryForeground();

// Prints one JSON line per change of foreground window, its monitor or its
// fullscreen state,
// polling every `interval_ms`, until stdin closes (the parent went away).
// Windows of `ignore_pid` (the caller) never count as fullscreen.
int WatchForeground(DWORD ignore_pid, DWORD interval_ms);

}  // namespace relay
