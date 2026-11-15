# Relay

Peer-to-peer screen sharing for Windows. One person broadcasts a monitor or a window, others watch by typing a short code. Video goes straight between the PCs over WebRTC; there's no Relay server in the middle.

## Status

Early development. What works today:

- Source picker with live thumbnails (monitors and windows), quality choice (sharpness or smoothness), and a local preview of what's being captured.

- Watching by code over a peer-to-peer connection, in a full-bleed player (volume, fullscreen, auto-hiding controls) or an always-on-top mini player.
- Resolution (native, 1440p, 1080p, 720p) and frame rate (60 or 30) chosen before or during a broadcast; H.264 with hardware encoding where available.
- The PC's sound without Discord's voice chat: a shared window sends only its app, a shared monitor sends everything except Discord.
- A per-user installer and silent self-updates from GitHub Releases.

## Installing

Download `RelaySetup-X.Y.Z.exe` from the [Releases page](https://github.com/davidambz/relay/releases/latest) and run it; no admin rights needed. Relay checks for new releases on its own afterwards (at startup and daily, or from the Updates panel) and installs them silently.

## Running from source

Requires [Node.js](https://nodejs.org/) 22+ on Windows 10 2004 (build 19041) or later. Sound and the window filter need the native helpers, built with CMake and the MSVC build tools (see `native/audiocap/README.md` and `native/winlist/README.md`); without them Relay still runs, video only, listing every capturable window.

```sh
npm ci
npm run dev                    # one window
npm run dev -- --instances 2   # two windows: broadcast in one, watch in the other
```

Every copy of Relay you open gets its own profile, so you can run several side by side on one PC to test broadcasting and watching alone.

Other scripts:

```sh
npm test          # unit tests (Vitest)
npm run lint      # oxlint
npm run typecheck
npm run build     # production renderer + Electron bundles
npm run dev:web   # the UI alone in a browser (viewer only), handy for phone-width layouts
```

Building the installer (Windows, after building the native helpers, with [Inno Setup 6](https://jrsoftware.org/isinfo.php)):

```sh
npm run package -w @relay/desktop
iscc apps/desktop/installer/relay.iss /DMyAppVersion=0.1.0
```

Releases are cut by pushing an annotated `vX.Y.Z` tag; `.github/workflows/release.yml` builds and publishes the installer.

## Layout

| Path | What |
|---|---|
| `packages/core` | Platform-independent TypeScript: share codes, locale resolution, the `Platform` port. |
| `packages/ui` | The React interface, shared by every shell. Talks to the host only through `Platform`. |
| `apps/desktop` | Electron shell for Windows. |
| `native/audiocap` | C++ WASAPI process-loopback helper: one app's sound, or everything but one app. |
| `native/winlist` | C++ helper listing the windows Alt+Tab shows, to filter the source picker. |

The UI never depends on Electron directly, so a mobile shell (Capacitor) can reuse `core` and `ui` as they are.

## License

GPLv3 — see [LICENSE](LICENSE).
