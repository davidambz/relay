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

#include "foreground.h"

#include <cstdint>
#include <cstdio>
#include <cwchar>
#include <string>

namespace relay {

namespace {

// The desktop and the taskbar can be "foreground" and span the monitor.
bool IsShellWindow(HWND hwnd) {
    wchar_t class_name[64] = {};
    GetClassNameW(hwnd, class_name, 64);
    return wcscmp(class_name, L"Progman") == 0 || wcscmp(class_name, L"WorkerW") == 0 ||
           wcscmp(class_name, L"Shell_TrayWnd") == 0 ||
           wcscmp(class_name, L"Shell_SecondaryTrayWnd") == 0;
}

// Closing stdin is how the parent says it's done (it also happens when the
// parent dies), so the watcher never outlives Relay.
DWORD WINAPI ExitWhenStdinCloses(LPVOID) {
    HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
    char buffer[64];
    DWORD read = 0;
    while (ReadFile(input, buffer, sizeof(buffer), &read, nullptr) && read > 0) {
    }
    ExitProcess(0);
}

}  // namespace

ForegroundInfo QueryForeground() {
    ForegroundInfo info;
    info.hwnd = GetForegroundWindow();
    if (info.hwnd == nullptr) {
        return info;
    }
    GetWindowThreadProcessId(info.hwnd, &info.pid);

    MONITORINFO monitor = {};
    monitor.cbSize = sizeof(monitor);
    if (!GetMonitorInfoW(MonitorFromWindow(info.hwnd, MONITOR_DEFAULTTONEAREST), &monitor)) {
        return info;
    }
    info.monitor = monitor.rcMonitor;

    RECT rect = {};
    if (IsShellWindow(info.hwnd) || IsIconic(info.hwnd) || !GetWindowRect(info.hwnd, &rect)) {
        return info;
    }
    // A maximized window with a title bar isn't fullscreen, even when the
    // taskbar auto-hides and it spans the whole monitor.
    const LONG style = GetWindowLongW(info.hwnd, GWL_STYLE);
    if (IsZoomed(info.hwnd) && (style & WS_CAPTION) == WS_CAPTION) {
        return info;
    }
    info.fullscreen = rect.left <= monitor.rcMonitor.left && rect.top <= monitor.rcMonitor.top &&
                      rect.right >= monitor.rcMonitor.right &&
                      rect.bottom >= monitor.rcMonitor.bottom;
    return info;
}

int WatchForeground(DWORD ignore_pid, DWORD interval_ms) {
    // Physical pixels everywhere, so the rects compare with the monitor's.
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    HANDLE thread = CreateThread(nullptr, 0, ExitWhenStdinCloses, nullptr, 0, nullptr);
    if (thread != nullptr) {
        CloseHandle(thread);
    }

    HWND last_hwnd = nullptr;
    bool last_fullscreen = false;
    bool first = true;
    for (;;) {
        ForegroundInfo info = QueryForeground();
        if (info.pid == ignore_pid) {
            info.fullscreen = false;
        }
        if (first || info.hwnd != last_hwnd || info.fullscreen != last_fullscreen) {
            first = false;
            last_hwnd = info.hwnd;
            last_fullscreen = info.fullscreen;
            char line[200];
            snprintf(line, sizeof(line),
                     "{\"hwnd\":%llu,\"pid\":%lu,\"fullscreen\":%s,\"monitor\":[%ld,%ld,%ld,%ld]}\n",
                     static_cast<unsigned long long>(reinterpret_cast<uintptr_t>(info.hwnd)),
                     static_cast<unsigned long>(info.pid), info.fullscreen ? "true" : "false",
                     info.monitor.left, info.monitor.top, info.monitor.right,
                     info.monitor.bottom);
            fputs(line, stdout);
            fflush(stdout);
        }
        Sleep(interval_ms);
    }
}

}  // namespace relay
