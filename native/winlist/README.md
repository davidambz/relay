# winlist

Small Windows helper that prints the top-level windows that would appear in
**Alt+Tab**, as one line of JSON on stdout. Relay uses it to filter
`desktopCapturer.getSources({ types: ['window'] })`, which also returns junk
(NVIDIA overlay, Raycast, tool windows, invisible helper windows), down to the
windows a person would consider open.

## Usage

```
winlist [--all]
winlist --watch-foreground [--ignore-pid N]
```

| Option | Meaning |
| --- | --- |
| (none) | Print the Alt+Tab-eligible windows. |
| `--all` | Print every top-level window with the computed flags and the rule that rejected it. For debugging. |
| `--watch-foreground` | Keep running and print a line whenever the foreground window or its fullscreen state changes (see below). Exits when stdin closes. |
| `--ignore-pid N` | With `--watch-foreground`: windows of process N never count as fullscreen (Relay passes its own pid). |

### Output

One line of UTF-8 JSON, an array in Z-order (EnumWindows order, topmost first):

```
[{"hwnd":198308,"pid":21176,"exe":"zen.exe","title":"Warframe Market — Zen Browser"}, ...]
```

| Field | Meaning |
| --- | --- |
| `hwnd` | The HWND as a decimal number. Same value as in Chromium's source id `window:<hwnd>:0`. |
| `pid` | Owning process (`GetWindowThreadProcessId`). |
| `exe` | Image file name only (e.g. `chrome.exe`), from `QueryFullProcessImageNameW`. Empty if `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)` is denied (e.g. elevated processes when winlist isn't elevated). |
| `title` | `GetWindowTextW`, JSON-escaped (quotes, backslashes, control characters). |

With `--all` each entry also has `class`, `style`, `exstyle`, `rect`, `iconic`,
`visible`, `cloaked` (raw `DWMWA_CLOAKED` value), `toolwindow`, `noactivate`,
`appwindow`, `owner` (`GW_OWNER`, decimal), `ownerChainOk`, `eligible` and
`reason` (first rule that failed, `""` when eligible).

### Watching the foreground

Relay keeps its mini player out of the way of fullscreen games with this
mode: while it's open, the app runs `winlist --watch-foreground` and reads
one JSON line per change (polled every 200 ms):

```
{"hwnd":526678,"pid":13624,"fullscreen":true,"monitor":[-1920,0,0,1080]}
```

| Field | Meaning |
| --- | --- |
| `hwnd`, `pid` | The foreground window and its process. |
| `fullscreen` | Its rect covers its whole monitor: exclusive or borderless fullscreen. Never for the desktop, the taskbar, minimized windows or maximized windows with a title bar. |
| `monitor` | That monitor's rect, `[left, top, right, bottom]` in physical pixels (the watcher is per-monitor DPI aware). |

The process exits when its stdin closes, which also happens when the parent dies.

### Eligibility rules

Applied in this order; the first failing rule is the `reason`:

| `reason` | Rule |
| --- | --- |
| `own-window` | Belongs to winlist itself, or is its console window. |
| `not-visible` | `IsWindowVisible` is false. |
| `cloaked` | `DWMWA_CLOAKED` is non-zero: suspended UWP frames, shell-cloaked windows, and windows on **other virtual desktops** (Alt+Tab's default is the current desktop only, so they are excluded). |
| `toolwindow` | `WS_EX_TOOLWINDOW` without `WS_EX_APPWINDOW`. |
| `noactivate` | `WS_EX_NOACTIVATE` without `WS_EX_APPWINDOW`. |
| `owner-chain` | Raymond Chen's test: from `GetAncestor(hwnd, GA_ROOTOWNER)`, follow `GetLastActivePopup` until it stops changing or hits a visible popup; the walk must end on the window itself. Skipped for `WS_EX_APPWINDOW` windows, which Windows always lists. |
| `tiny` | Not minimized and narrower or shorter than 16 px. Not in Raymond's list: Raycast hides its launcher by shrinking it to 2x2 px (it has `WS_EX_APPWINDOW`, so the style rules let it through). |
| `empty-title` | Empty window title. |

Minimized windows are kept, as in Alt+Tab.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | OK |
| 2 | Bad arguments |

### Examples

```
winlist
winlist --all > windows.json
```

## Building

MSVC (VS 2022 Build Tools) and CMake 3.21+, from a VS developer prompt:

```
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

The result is `build/winlist.exe`, statically linked against the CRT.

## Notes

- UWP apps are hosted in an `ApplicationFrameWindow` owned by
  `ApplicationFrameHost.exe`; winlist reports that frame's `pid`/`exe` as-is.
  Resolving the real app process (the `Windows.UI.Core.CoreWindow` child) is
  left to the caller if it ever needs it.
- `GetWindowTextW` on another process's window reads the cached caption without
  sending `WM_GETTEXT`, so a hung app can't block winlist.
- Some overlays (NVIDIA GeForce Overlay, Discord Overlay, Overwolf) are visible,
  uncloaked, screen-sized windows; they're dropped by the `toolwindow` rule.
