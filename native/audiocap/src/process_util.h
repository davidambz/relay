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

#include <optional>
#include <string>

namespace relay {

// Returns the Windows build number (via RtlGetVersion, which is not subject to
// the manifest-based version lie of GetVersionEx), or 0 if it can't be read.
DWORD GetWindowsBuildNumber();

// Finds the root process of a running Discord client (Discord.exe,
// DiscordPTB.exe or DiscordCanary.exe): the process with that image name whose
// parent does not have the same image name. Discord's audio comes from a child
// process, so excluding the root's tree is what keeps voice chat out.
std::optional<DWORD> FindDiscordRootPid(std::wstring* image_name = nullptr);

}  // namespace relay
