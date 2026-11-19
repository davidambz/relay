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


// winlist: prints the top-level windows that would appear in Alt+Tab as one
// line of JSON on stdout. Relay uses it to filter desktopCapturer's window
// sources down to the windows a person would consider "open".

#include <fcntl.h>
#include <io.h>
#include <windows.h>

#include <cstdint>
#include <cstdio>
#include <cwchar>
#include <string>

#include "foreground.h"
#include "json_writer.h"
#include "window_list.h"

namespace {

constexpr int kExitOk = 0;
constexpr int kExitUsage = 2;
// Fast enough that the mini player stops catching the mouse right as a
// game takes over, cheap enough to run for as long as it's open.
constexpr DWORD kForegroundPollMs = 200;

void PrintUsage() {
    fputs(
        "usage: winlist [--all]\n"
        "       winlist --watch-foreground [--ignore-pid N]\n"
        "\n"
        "  (no flags)  print the Alt+Tab windows as a JSON array:\n"
        "              [{\"hwnd\":N,\"pid\":N,\"exe\":\"...\",\"title\":\"...\"}, ...]\n"
        "  --all       print every top-level window with the computed flags\n"
        "  --watch-foreground\n"
        "              keep running; print a JSON line whenever the foreground\n"
        "              window or its fullscreen state changes, until stdin closes:\n"
        "              {\"hwnd\":N,\"pid\":N,\"fullscreen\":B,\"monitor\":[l,t,r,b]}\n"
        "  --ignore-pid N\n"
        "              with --watch-foreground: N's windows never count as fullscreen\n",
        stderr);
}

// Same decimal value Chromium uses in desktopCapturer ids ("window:<hwnd>:0").
std::string HwndToString(HWND hwnd) {
    return std::to_string(reinterpret_cast<uintptr_t>(hwnd));
}

const char* Bool(bool value) { return value ? "true" : "false"; }

void AppendWindow(std::string& out, const relay::WindowInfo& w, bool all) {
    out += "{\"hwnd\":";
    out += HwndToString(w.hwnd);
    out += ",\"pid\":";
    out += std::to_string(w.pid);
    out += ",\"exe\":";
    relay::AppendJsonString(out, w.exe);
    out += ",\"title\":";
    relay::AppendJsonString(out, w.title);
    if (all) {
        out += ",\"class\":";
        relay::AppendJsonString(out, w.class_name);
        char extra[160];
        snprintf(extra, sizeof(extra),
                 ",\"style\":\"0x%08lx\",\"exstyle\":\"0x%08lx\",\"rect\":[%ld,%ld,%ld,%ld],"
                 "\"iconic\":%s",
                 static_cast<unsigned long>(w.style), static_cast<unsigned long>(w.ex_style),
                 w.rect.left, w.rect.top, w.rect.right, w.rect.bottom, Bool(w.iconic));
        out += extra;
        out += ",\"visible\":";
        out += Bool(w.visible);
        out += ",\"cloaked\":";
        out += std::to_string(w.cloaked);
        out += ",\"toolwindow\":";
        out += Bool(w.tool_window);
        out += ",\"noactivate\":";
        out += Bool(w.no_activate);
        out += ",\"appwindow\":";
        out += Bool(w.app_window);
        out += ",\"owner\":";
        out += HwndToString(w.owner);
        out += ",\"ownerChainOk\":";
        out += Bool(w.owner_chain_ok);
        out += ",\"eligible\":";
        out += Bool(w.eligible);
        out += ",\"reason\":\"";
        out += w.reason;
        out += '"';
    }
    out += '}';
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
    bool all = false;
    bool watch = false;
    DWORD ignore_pid = 0;
    for (int i = 1; i < argc; ++i) {
        if (wcscmp(argv[i], L"--all") == 0) {
            all = true;
        } else if (wcscmp(argv[i], L"--watch-foreground") == 0) {
            watch = true;
        } else if (wcscmp(argv[i], L"--ignore-pid") == 0 && i + 1 < argc) {
            ignore_pid = static_cast<DWORD>(wcstoul(argv[++i], nullptr, 10));
        } else if (wcscmp(argv[i], L"--help") == 0 || wcscmp(argv[i], L"-h") == 0) {
            PrintUsage();
            return kExitOk;
        } else {
            fprintf(stderr, "winlist: unknown argument: %ls\n", argv[i]);
            PrintUsage();
            return kExitUsage;
        }
    }

    if (watch) {
        return relay::WatchForeground(ignore_pid, kForegroundPollMs);
    }

    std::string out = "[";
    bool first = true;
    for (const relay::WindowInfo& w : relay::EnumerateTopLevelWindows()) {
        if (!all && !w.eligible) {
            continue;
        }
        if (!first) {
            out += ',';
        }
        first = false;
        AppendWindow(out, w, all);
    }
    out += "]\n";

    // Binary mode: the bytes are already UTF-8, and "\n" must not become "\r\n".
    _setmode(_fileno(stdout), _O_BINARY);
    fwrite(out.data(), 1, out.size(), stdout);
    fflush(stdout);
    return kExitOk;
}
