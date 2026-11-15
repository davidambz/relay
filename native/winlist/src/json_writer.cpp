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


#include "json_writer.h"

#include <windows.h>

#include <cstdio>

namespace relay {

std::string ToUtf8(std::wstring_view text) {
    if (text.empty()) {
        return {};
    }
    const int length = static_cast<int>(text.size());
    const int size = WideCharToMultiByte(CP_UTF8, 0, text.data(), length, nullptr, 0, nullptr,
                                         nullptr);
    if (size <= 0) {
        return {};
    }
    std::string result(static_cast<size_t>(size), '\0');
    WideCharToMultiByte(CP_UTF8, 0, text.data(), length, result.data(), size, nullptr, nullptr);
    return result;
}

void AppendJsonString(std::string& out, std::wstring_view text) {
    const std::string utf8 = ToUtf8(text);
    out.push_back('"');
    for (const char c : utf8) {
        const auto byte = static_cast<unsigned char>(c);
        switch (c) {
            case '"':
                out += "\\\"";
                break;
            case '\\':
                out += "\\\\";
                break;
            case '\b':
                out += "\\b";
                break;
            case '\f':
                out += "\\f";
                break;
            case '\n':
                out += "\\n";
                break;
            case '\r':
                out += "\\r";
                break;
            case '\t':
                out += "\\t";
                break;
            default:
                if (byte < 0x20 || byte == 0x7f) {
                    char escape[8];
                    snprintf(escape, sizeof(escape), "\\u%04x", byte);
                    out += escape;
                } else {
                    out.push_back(c);
                }
                break;
        }
    }
    out.push_back('"');
}

}  // namespace relay
