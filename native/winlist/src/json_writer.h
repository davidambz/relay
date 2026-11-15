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

#include <string>
#include <string_view>

namespace relay {

// Converts UTF-16 to UTF-8. Unpaired surrogates become U+FFFD.
std::string ToUtf8(std::wstring_view text);

// Appends `text` to `out` as a quoted JSON string (UTF-8). Quotes, backslashes
// and control characters are escaped; everything else is emitted verbatim.
void AppendJsonString(std::string& out, std::wstring_view text);

}  // namespace relay
