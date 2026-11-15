# Relay

Peer-to-peer screen sharing for Windows. One person broadcasts a monitor or a window, everyone else types a six-character code and watches. Video and sound go straight from the broadcaster's PC to each viewer over WebRTC; there is no Relay server in the middle.

Built for watching a friend's screen during a voice call: the broadcast can carry the PC's sound **without** echoing the call's voices back.

## Features

**Broadcasting (Windows)**

- Source picker with live thumbnails, split into Monitors and Windows. Overlays, launchers and invisible helper windows are filtered out, and so is Relay itself.
- Resolution (native, 1440p, 1080p, 720p) and frame rate (60 or 30), changeable mid-broadcast without dropping viewers. 60 fps keeps motion smooth; 30 fps keeps text sharp.
- H.264 first in negotiation, so the GPU's hardware encoder does the work when there is one.
- System sound without Discord's voice chat:
  - sharing a **window** sends only that app's sound;
  - sharing a **monitor** sends everything except Discord (Stable, PTB and Canary);
  - sound can be muted mid-broadcast.
- A big copyable code, a preview of what's going out, and a lamp for each viewer watching. Closing the shared window ends the broadcast.

**Watching (Windows and Android)**

- Full-bleed player with volume, fullscreen and controls that hide after a couple of seconds. On touch, a tap shows or hides them.
- Mini player:
  - Windows: a small always-on-top window;
  - Android: system Picture-in-Picture, entered automatically when you leave the app mid-broadcast.
- Clear messages for a wrong code, a full broadcast, a broadcast that ended, and a connection that can't get through.

**Everywhere**

- English and Brazilian Portuguese, following the system language.
- Light and dark themes, following the system theme.
- Silent self-updates on Windows from GitHub Releases, never while you're broadcasting or watching.

### Keyboard shortcuts (player)

| Key | Action |
|---|---|
| `F` / double-click | Fullscreen |
| `M` | Mute |
| `P` | Mini player |

Every shortcut also has a button.

## Installing

**Windows 10 2004 (build 19041) or later, or Windows 11, x64.** Download `RelaySetup-X.Y.Z.exe` from the [latest release](https://github.com/davidambz/relay/releases/latest) and run it. It installs per user, without admin rights. Relay checks for updates at startup, once a day and from the Updates panel.

The installer isn't code-signed yet, so Windows SmartScreen may warn the first time; choose *More info → Run anyway*.

**Android 7.0 or later (viewer only).** There's no store release yet. Each push to `main` builds a debug APK, available as the `relay-android-debug` artifact of the [Android workflow](https://github.com/davidambz/relay/actions/workflows/android.yml).

## How it works

```
 Broadcaster (Windows)                        Viewer (Windows / Android)
 ─────────────────────                        ──────────────────────────
 1. registers relay-tenno-v1-<CODE> ──┐   ┌── 2. connects to that id
                                      ▼   ▼
                          PeerJS signaling server
                         (only introduces the peers)
                                      │   │
 3. on the data connection opening,   │   │
    calls the viewer with the stream ─┼───┼─▶ 4. answers receive-only
                                          │
 ◀════════════ WebRTC media, peer to peer (DTLS-SRTP) ════════════▶
```

- **Signaling** uses the free PeerJS cloud server by default. It only sees peer ids and connection setup; media never passes through it.
- **NAT traversal** uses Google's public STUN servers. There is no TURN relay by default, so some networks (symmetric NAT, carrier-grade NAT, common on 4G) can't connect directly; the viewer then sees a "couldn't connect" message after 20 seconds. You can add a TURN server, see [Configuration](#configuration).
- **Any number of viewers** can join. It's a mesh: each viewer gets its own connection, with its own encode and upload on the broadcaster's PC, so the per-viewer bitrate steps down as people join (about 12 Mbps with 1–2 viewers, 10 with 3–4, 8 with 5–6, 6 with 7–10, 4 beyond) to keep the total upload reasonable. In practice the broadcaster's upload and encoder set the ceiling; a large audience would need a media server, which is out of scope.
- **Sound** comes from `audiocap.exe`, a small helper that uses Windows' per-process audio loopback (WASAPI process loopback). Chromium's own loopback would capture the whole system, Discord included. The helper streams 48 kHz stereo PCM to the app, which turns it into a WebRTC track sent as stereo Opus at 128 kbps.

### Privacy

- Anyone who has the code can watch while the broadcast is live. Codes are random (about a billion combinations) and change every broadcast, but treat a code like a meeting link: share it only with the people you want watching. Stop the broadcast and the code is dead.
- Media is encrypted in transit (standard WebRTC DTLS-SRTP). The keys are negotiated through the signaling server, so for the strongest guarantee run your own (see [Configuration](#configuration)).
- Relay collects nothing. The only outside services it talks to are the signaling server and the STUN servers (both see your IP address, as with any WebRTC call) and, for updates, the GitHub API.

## Configuration

Relay keeps its settings in `%APPDATA%\Relay\settings.json`. Under the `session` key you can add a TURN server, point to your own [PeerJS server](https://github.com/peers/peerjs-server), or cap the number of viewers (there's no cap by default):

```json
{
  "session": {
    "iceServers": [
      { "urls": "stun:stun.l.google.com:19302" },
      { "urls": "turn:turn.example.com:3478", "username": "user", "credential": "secret" }
    ],
    "server": { "host": "peer.example.com", "port": 443, "path": "/", "secure": true },
    "maxViewers": 5,
    "preferredVideoCodec": "H264"
  }
}
```

- Every field is optional. A missing or malformed field keeps its default.
- `iceServers` **replaces** the default list, so keep a STUN entry when adding TURN.
- `preferredVideoCodec: null` leaves codec choice to the browser engine.
- Broadcaster and viewers must use the same signaling `server`.
- Restart Relay after editing the file.

## Development

### Requirements

- [Node.js](https://nodejs.org/) 22+.
- Windows 10 2004+ to run the desktop app.
- For sound and the window filter, build the native helpers with CMake and the MSVC build tools: see [`native/audiocap`](native/audiocap/README.md) and [`native/winlist`](native/winlist/README.md). Without them Relay still runs, video only, and lists every capturable window.

The UI, the core and the tests also run on Linux and macOS (CI runs them on Ubuntu).

### Running

```sh
npm ci
npm run dev                    # one window
npm run dev -- --instances 2   # two windows: broadcast in one, watch in the other
npm run dev:web                # the UI alone in a browser (viewer only), handy for phone widths
```

Every copy of Relay you open gets its own profile, so you can broadcast and watch on the same PC.

### Checks

```sh
npm run lint        # oxlint
npm run typecheck
npm test            # Vitest + Testing Library
npm run build       # production renderer + Electron bundles
```

> To add or update dependencies, use `npx -y npm@11 install …`. npm 10 fails to resolve this tree (`Cannot read properties of null (reading 'edgesOut')`). The lockfile it writes works with `npm ci` on npm 10.

### Packaging

Windows installer, after building the native helpers, with [Inno Setup 6](https://jrsoftware.org/isinfo.php):

```sh
npm run package -w @relay/desktop      # electron-builder --dir → apps/desktop/release/win-unpacked
iscc apps/desktop/installer/relay.iss /DMyAppVersion=0.1.0
```

Android debug APK, with JDK 21 and the Android SDK:

```sh
npm run sync -w @relay/mobile
cd apps/mobile/android && ./gradlew assembleDebug
```

### Releases

Releases come from an annotated tag; there's no version file to bump:

```sh
git tag -a v0.2.0 -m "What changed, in plain words for the people downloading it"
git push origin v0.2.0
```

`.github/workflows/release.yml` gates on lint, typecheck and tests, builds the native helpers, stamps the version, packages the app, builds `RelaySetup-0.2.0.exe` and publishes the release. The tag message becomes the release notes. Installed copies pick the release up on their next update check.

## Project layout

| Path | What |
|---|---|
| `packages/core` | Platform-independent TypeScript: share codes, the host and viewer sessions over PeerJS, bitrate and quality policy, SDP rewriting, update decisions, the `Platform` port. No DOM-only or Electron imports. |
| `packages/ui` | The React interface (Vite, CSS Modules), shared by every shell. Talks to the device only through `Platform` and decides what to show from its `capabilities`. |
| `apps/desktop` | Electron shell for Windows: source picker backend, display-media handler, mini player window, audio pipeline, settings, self-updater, Inno Setup installer. |
| `apps/mobile` | Capacitor shell for Android (viewer only), with a native Picture-in-Picture plugin. |
| `native/audiocap` | C++ WASAPI process-loopback helper: one app's sound, or everything but one app. |
| `native/winlist` | C++ helper listing the windows Alt+Tab shows, to filter the source picker. |

The protocol is the same on every platform, so a phone can watch a PC with nothing special.

## License

[GPLv3](LICENSE) or later. Copyright © 2026 David Ambrozio.
