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

#include "process_util.h"

#include <tlhelp32.h>

#include <array>
#include <unordered_map>

namespace relay {

namespace {

using RtlGetVersionFn = LONG(WINAPI*)(PRTL_OSVERSIONINFOW);

struct ProcessEntry {
    std::wstring name;
    DWORD parent_pid = 0;
};

}  // namespace

DWORD GetWindowsBuildNumber() {
    HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
    if (ntdll == nullptr) {
        return 0;
    }
    auto rtl_get_version =
        reinterpret_cast<RtlGetVersionFn>(GetProcAddress(ntdll, "RtlGetVersion"));
    if (rtl_get_version == nullptr) {
        return 0;
    }
    RTL_OSVERSIONINFOW info{};
    info.dwOSVersionInfoSize = sizeof(info);
    if (rtl_get_version(&info) != 0) {
        return 0;
    }
    if (info.dwMajorVersion < 10) {
        return 0;
    }
    return info.dwBuildNumber;
}

std::optional<DWORD> FindDiscordRootPid(std::wstring* image_name) {
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE) {
        return std::nullopt;
    }
    std::unordered_map<DWORD, ProcessEntry> processes;
    PROCESSENTRY32W entry{};
    entry.dwSize = sizeof(entry);
    if (Process32FirstW(snapshot, &entry)) {
        do {
            processes[entry.th32ProcessID] = {entry.szExeFile, entry.th32ParentProcessID};
        } while (Process32NextW(snapshot, &entry));
    }
    CloseHandle(snapshot);

    // Stable first, then PTB, then Canary, if several are running at once.
    constexpr std::array<const wchar_t*, 3> kNames = {L"Discord.exe", L"DiscordPTB.exe",
                                                      L"DiscordCanary.exe"};
    for (const wchar_t* name : kNames) {
        for (const auto& [pid, process] : processes) {
            if (_wcsicmp(process.name.c_str(), name) != 0) {
                continue;
            }
            auto parent = processes.find(process.parent_pid);
            // A stale parent PID can be reused by an unrelated process, but
            // that only matters if it happens to also be named Discord.exe.
            bool parent_is_same = parent != processes.end() && parent->first != pid &&
                                  _wcsicmp(parent->second.name.c_str(), name) == 0;
            if (!parent_is_same) {
                if (image_name != nullptr) {
                    *image_name = process.name;
                }
                return pid;
            }
        }
    }
    return std::nullopt;
}

}  // namespace relay
