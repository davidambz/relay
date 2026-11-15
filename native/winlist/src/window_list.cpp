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


#include "window_list.h"

#include <dwmapi.h>

#include <iterator>
#include <unordered_map>
#include <utility>

namespace relay {

namespace {

// Non-minimized windows narrower or shorter than this are treated as hidden.
constexpr LONG kMinSize = 16;

// Raymond Chen, "Which windows appear in the Alt+Tab list?": start at the root
// owner and follow the last active popup chain until it stops changing or
// reaches a visible popup. The window is the Alt+Tab representative of its
// owner group only if the walk ends on it.
bool OwnerChainEndsAt(HWND hwnd) {
    HWND walk = GetAncestor(hwnd, GA_ROOTOWNER);
    if (walk == nullptr) {
        walk = hwnd;
    }
    for (int i = 0; i < 64; ++i) {  // bounded, in case of a pathological cycle
        HWND popup = GetLastActivePopup(walk);
        if (popup == nullptr || popup == walk) {
            break;
        }
        if (IsWindowVisible(popup)) {
            walk = popup;
            break;
        }
        walk = popup;
    }
    return walk == hwnd;
}

std::wstring ExeNameForPid(DWORD pid) {
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (process == nullptr) {
        return {};
    }
    wchar_t path[MAX_PATH * 2];
    DWORD size = static_cast<DWORD>(std::size(path));
    std::wstring result;
    if (QueryFullProcessImageNameW(process, 0, path, &size)) {
        std::wstring full(path, size);
        const size_t slash = full.find_last_of(L"\\/");
        result = slash == std::wstring::npos ? full : full.substr(slash + 1);
    }
    CloseHandle(process);
    return result;
}

struct EnumState {
    std::vector<WindowInfo>* windows;
    std::unordered_map<DWORD, std::wstring>* exe_cache;
    DWORD self_pid;
    HWND console;
};

void Classify(WindowInfo& w, const EnumState& state) {
    if (w.pid == state.self_pid || (state.console != nullptr && w.hwnd == state.console)) {
        w.reason = "own-window";
    } else if (!w.visible) {
        w.reason = "not-visible";
    } else if (w.cloaked != 0) {
        w.reason = "cloaked";
    } else if (w.tool_window && !w.app_window) {
        w.reason = "toolwindow";
    } else if (w.no_activate && !w.app_window) {
        w.reason = "noactivate";
    } else if (!w.owner_chain_ok && !w.app_window) {
        // WS_EX_APPWINDOW forces an owned window into Alt+Tab, like the taskbar.
        w.reason = "owner-chain";
    } else if (!w.iconic && (w.rect.right - w.rect.left < kMinSize ||
                             w.rect.bottom - w.rect.top < kMinSize)) {
        // Not part of Raymond Chen's list: apps like Raycast "hide" their
        // launcher by shrinking it to a couple of pixels instead of hiding it.
        // Minimized windows are kept (their rect is a stub at -32000,-32000).
        w.reason = "tiny";
    } else if (w.title.empty()) {
        w.reason = "empty-title";
    } else {
        w.eligible = true;
    }
}

BOOL CALLBACK OnWindow(HWND hwnd, LPARAM param) {
    auto& state = *reinterpret_cast<EnumState*>(param);
    WindowInfo w;
    w.hwnd = hwnd;
    w.owner = GetWindow(hwnd, GW_OWNER);
    GetWindowThreadProcessId(hwnd, &w.pid);

    // For windows of other processes GetWindowTextW reads the cached caption
    // without sending WM_GETTEXT, so a hung app can't block us.
    const int length = GetWindowTextLengthW(hwnd);
    if (length > 0) {
        w.title.resize(static_cast<size_t>(length) + 1);
        const int copied = GetWindowTextW(hwnd, w.title.data(), length + 1);
        w.title.resize(copied > 0 ? static_cast<size_t>(copied) : 0);
    }
    wchar_t class_name[256];
    const int class_length = GetClassNameW(hwnd, class_name, 256);
    if (class_length > 0) {
        w.class_name.assign(class_name, static_cast<size_t>(class_length));
    }

    const LONG_PTR ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    w.style = static_cast<DWORD>(GetWindowLongPtrW(hwnd, GWL_STYLE));
    w.ex_style = static_cast<DWORD>(ex_style);
    GetWindowRect(hwnd, &w.rect);
    w.iconic = IsIconic(hwnd) != FALSE;
    w.visible = IsWindowVisible(hwnd) != FALSE;
    w.tool_window = (ex_style & WS_EX_TOOLWINDOW) != 0;
    w.no_activate = (ex_style & WS_EX_NOACTIVATE) != 0;
    w.app_window = (ex_style & WS_EX_APPWINDOW) != 0;
    DWORD cloaked = 0;
    if (SUCCEEDED(DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &cloaked, sizeof(cloaked)))) {
        w.cloaked = cloaked;
    }
    w.owner_chain_ok = OwnerChainEndsAt(hwnd);

    auto cached = state.exe_cache->find(w.pid);
    if (cached == state.exe_cache->end()) {
        cached = state.exe_cache->emplace(w.pid, ExeNameForPid(w.pid)).first;
    }
    w.exe = cached->second;

    Classify(w, state);
    state.windows->push_back(std::move(w));
    return TRUE;
}

}  // namespace

std::vector<WindowInfo> EnumerateTopLevelWindows() {
    std::vector<WindowInfo> windows;
    std::unordered_map<DWORD, std::wstring> exe_cache;
    EnumState state{&windows, &exe_cache, GetCurrentProcessId(), GetConsoleWindow()};
    EnumWindows(OnWindow, reinterpret_cast<LPARAM>(&state));
    return windows;
}

}  // namespace relay
