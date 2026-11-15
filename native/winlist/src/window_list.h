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

#include <string>
#include <vector>

namespace relay {

// One top-level window plus the inputs and result of the Alt+Tab test.
struct WindowInfo {
    HWND hwnd = nullptr;
    HWND owner = nullptr;  // GetWindow(GW_OWNER)
    DWORD pid = 0;
    std::wstring exe;    // image file name only, e.g. L"chrome.exe"; empty if access denied
    std::wstring title;  // GetWindowTextW
    std::wstring class_name;

    DWORD style = 0;     // GWL_STYLE
    DWORD ex_style = 0;  // GWL_EXSTYLE
    RECT rect{};         // GetWindowRect
    bool iconic = false;  // IsIconic (minimized)
    bool visible = false;      // IsWindowVisible
    DWORD cloaked = 0;         // DWMWA_CLOAKED (0, or DWM_CLOAKED_APP/SHELL/INHERITED bits)
    bool tool_window = false;  // WS_EX_TOOLWINDOW
    bool no_activate = false;  // WS_EX_NOACTIVATE
    bool app_window = false;   // WS_EX_APPWINDOW
    bool owner_chain_ok = false;  // the GA_ROOTOWNER / GetLastActivePopup walk ends at hwnd

    bool eligible = false;
    // Name of the first rule that rejected the window ("" when eligible).
    const char* reason = "";
};

// Enumerates every top-level window in Z-order (EnumWindows order) and fills in
// the Alt+Tab eligibility for each one.
std::vector<WindowInfo> EnumerateTopLevelWindows();

}  // namespace relay
