# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Brazilian streamers who use OBS or another RTMP-compatible streaming app and want to stream to more than one platform without running servers or depending on a relay subscription. The audience includes beginners who need a guided flow and experienced streamers who value per-destination control, resilience and privacy.

## Product Purpose

The public site presents and distributes Corneta, a desktop app that receives a single local RTMP signal and sends it to multiple destinations. OBS is the recommended app because it has setup, control and stats integration. The public surface succeeds when a visitor understands the benefit within a few seconds and downloads the app for Windows.

Corneta is ready to use on Windows x64. The app must not be presented as experimental or as getting ready for a beta. Experimental labels apply only to the specific features and integrations listed in this document, not to the product as a whole. Installer availability follows the published releases.

## Positioning

Corneta runs multistreaming locally and keeps each destination independent. That lets the streamer monitor, reconnect, pause and adjust outputs separately, with no monthly relay fee and with keys, settings and reports kept on the streamer's computer.

## Operating Context

The streamer prepares scenes, camera and audio in OBS or another RTMP-compatible app. Corneta comes after it: it receives the local signal, measures the available upload, distributes the stream, monitors the destinations and gathers useful information during and after the stream. Automatic setup, start/stop control and the built-in stats are specific to OBS; other sources require pointing them manually at the local server and key.

## Capabilities and Constraints

- The current app is Windows-first; there are no confirmed public builds for macOS or Linux.
- Requires an RTMP-compatible video/audio source. OBS is recommended but not required; accepting the signal from another app does not mean offering the same setup, control and stats integration.
- Multistreaming, OBS setup, upload test, independent destinations, chat, alerts, aggregated audience and reports exist in the product.
- Stream keys are kept in the operating system's native vault.
- Three quality modes exist, with these names in the interface: “Straight up” (copies the OBS signal to every destination), “Smart” (copies what already fits and re-encodes only what needs it) and “All out” (re-encodes each destination with the platform's preset). The app estimates combined upload, number of re-encodes and load before the stream.
- Re-encoding uses a hardware encoder when available (NVENC, QSV, AMF) and falls back to software; the app estimates how many simultaneous sessions the graphics card can handle.
- A vertical 9:16 crop with pan and zoom exists (framing editor + engine filter) for destinations that only accept portrait video.
- Unified chat reads Twitch, Kick and YouTube with emotes (BTTV/FFZ/7TV and native), badges and timestamps; it sends messages and can delete messages and time users out. A floating window shows chat, alerts or both.
- Native alerts (follower, sub, resub, subgift, bits, raid, member, superchat) and external sources (Streamlabs, StreamElements) exist; tokens are kept in the vault.
- An OBS overlay exists: a local loopback server serves alerts and chat as a Browser Source, with configurable position, size, duration, sound and limits, plus a test alert.
- Auto-bitrate exists and acts on destinations that are re-encoding. The Audio normalizer (loudnorm) exists and is opt-in.
- Automatic YouTube exists: with the account connected, the app creates the broadcast and injects the key when the stream starts.
- Global shortcut, tray, start with Windows, light/dark theme, destination profiles and settings backup exist.
- Per-destination metrics during the stream exist: bitrate, fps, dropped frames, time on air, plus CPU, GPU and OBS stats.
- Co-streaming with guests (“Table”) exists in the code, but it is turned off by a feature flag and must not be promoted.
- The Twitch implementation is not a certification of real-world operation. This source does not present a verifiable per-platform stream rehearsal; the external matrix must be recorded and approved before distribution.
- TikTok, Instagram and X are experimental.
- Protection through the “BE RIGHT BACK” screen when OBS drops exists.
- Deck mode exists: the phone, through the browser and without installing an app, becomes the stream's control panel on the local network. It marks moments, turns on BE RIGHT BACK, switches scene and microphone, changes the title, sends a message to chat, pauses a destination and runs combos. It also shows warnings with the action that fixes them, the chat and the stream's health. It is off by default and pairs by QR code, with a 4-digit code and permission on the PC. It only works with the PC and the phone on the same network, and the connection is not encrypted, so the page has to tell people to avoid public Wi-Fi.
- Black or frozen screen detection must not be presented as finished.
- Each destination uses upload; transcoding can also use CPU or GPU.
- The local core is free and the project uses the MIT license.

## Brand Commitments

- The product name is Corneta.
- The existing brand and the bugle symbol are recognizable product assets.
- The voice must be casual, direct, Brazilian and appealing to streamers.
- Avoid overly technical, formal or editorial language.
- Communication must be fun without seeming childish and confident without hiding limitations.

## Evidence on Hand

- Working app interface in `../src/`.
- Landing page presentation video (`public/video/`) and crops of the app's real screens (`public/images/lp/`), made from the contributor demo mode; the people, names and numbers in them are illustrative.
- The landing page's bandwidth and load calculation is the crop of the app's Quality screen, which computes it with `../src/lib/estimates.ts` and each destination's presets in `../src/platforms/<id>/destination.json`; if it ever becomes HTML, it has to mirror those files.
- Copy for features and caveats mirrors the app's labels (`../src/screens/SettingsScreen.tsx`, `EncodingScreen.tsx`, `ChatScreen.tsx`).
- [Real-world validation criteria](../docs/RELEASE-GATES.md). They are requirements, not evidence that a rehearsal took place. When documenting a rehearsal, record the platform, version/commit, date, scenario, environment and verifiable result before announcing validation.
- Architecture and features documented in `../README.md` and `../docs/`.
- MIT license in `../LICENSE`.
- There are no testimonials, public user numbers, commercial benchmarks or customer logos; they must not be fabricated.

## Product Principles

1. Explain the result before the technology.
2. Show the app working instead of piling up claims.
3. Be transparent about platform, upload and experimental features.
4. Keep a single main action: download the Windows version.
5. Make beginners feel capable without pushing away experienced streamers.

## Accessibility & Inclusion

The site must work with a keyboard, respect reduced motion, keep WCAG AA contrast, use a clear semantic structure and stay usable on mobile and at 200% zoom.
