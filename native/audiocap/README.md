# audiocap

Small Windows helper that captures audio with WASAPI **process loopback** and
streams it as raw PCM on stdout (or writes a `.wav`). Relay uses it to share
the PC's sound without picking up Discord voice chat.

Requires Windows 10 version 2004 (build 19041) or newer.

## Usage

```
audiocap (--include <pid> | --exclude <pid> | --system)
         [--wav <path>] [--seconds N] [--format F] [--ignore-stdin]
audiocap --find-discord
audiocap --probe-formats (--include <pid> | --exclude <pid> | --system)
```

| Option | Meaning |
| --- | --- |
| `--include <pid>` | Capture only `<pid>` and its child processes (`PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE`). Used when sharing a window. |
| `--exclude <pid>` | Capture everything except `<pid>` and its children (`PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE`). Used with Discord's root PID when sharing a monitor. |
| `--system` | Whole-system capture: process loopback in exclude mode targeting audiocap's own PID. audiocap plays nothing, so this is everything, with the same code path and format as the other modes (no separate endpoint-loopback path). |
| `--wav <path>` | Write a 32-bit float WAV instead of raw PCM on stdout. |
| `--seconds N` | Stop after N seconds of wall-clock time. |
| `--format F` | Format passed to `IAudioClient::Initialize`: `auto` (default), `float`, `float-ext`, `float-autoconvert`, `pcm16`. `auto` tries them in that order. |
| `--ignore-stdin` | Don't treat EOF on a piped stdin as a stop signal. |
| `--find-discord` | Print the root PID of `Discord.exe` / `DiscordPTB.exe` / `DiscordCanary.exe` (the process whose parent has a different name). Exit 1 if none is running. |
| `--probe-formats` | Try every `--format` against the target and print which ones `Initialize` accepts. |

### Output

Unless `--wav` is given, stdout carries raw interleaved **float32 little-endian,
48000 Hz, 2 channels** (8 bytes per frame), whatever format WASAPI accepted
(a `pcm16` capture is converted to float). Packets arrive every ~10 ms, even
when the target is silent. Status lines and errors (with HRESULTs) go to stderr.

### Stopping

Capture ends cleanly on any of: Ctrl+C / Ctrl+Break, EOF on stdin when stdin is
a pipe (the parent closes it), `--seconds` elapsing, or stdout being closed.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | OK |
| 1 | `--find-discord`: Discord is not running |
| 2 | Bad arguments, or the target PID doesn't exist |
| 3 | Windows older than build 19041 |
| 4 | Audio error (activation, Initialize or capture failed) |
| 5 | I/O error writing the WAV |

### Examples

```
audiocap --system --wav test.wav --seconds 5
audiocap --exclude 16296 > pcm.raw
for /f %p in ('audiocap --find-discord') do audiocap --exclude %p --wav nodiscord.wav --seconds 5
```

## Building

MSVC (VS 2022 Build Tools) and CMake 3.21+, from a VS developer prompt:

```
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

The result is `build/audiocap.exe`, statically linked against the CRT.

## Notes

- Process loopback has no mix format (`GetMixFormat` isn't supported), so the
  format is given to `Initialize` explicitly. 48 kHz float32 stereo
  (`WAVE_FORMAT_IEEE_FLOAT`) is accepted directly; the other formats are
  fallbacks.
- Activation succeeds even for a PID that doesn't exist (you just get
  silence), so audiocap checks that the PID exists first.
- The `ActivateAudioInterfaceAsync` completion handler must implement
  `IAgileObject`.
- One audio client can exclude only one process tree.
