# Changelog

Notable changes to Corneta, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). The
[release notes](https://github.com/pitroldev/corneta/releases) carry the same changes
in English and Portuguese, with the installers.

## [Unreleased]

### Changed

- Corneta speaks English by default in the app, the installer and the website, and switches to Portuguese only when Windows or the browser asks for it. The Portuguese home page of the website moved to `/pt-BR`.
- Every help article and guide on the website has an English version. The OBS overlays, the Table studio and the sign-in errors follow the app's language.
- The project contact is now contact@corneta.live.
- Source code, documentation and contribution templates are written in English.

### Fixed

- Cinefy subscribers showed the subscriber badge twice. They now get a single SUB badge, with the subscription length in its tooltip.

### Security

- Release files get GitHub build provenance attestations, and the installer gets an SPDX SBOM of the source dependencies. See [how to verify a release](docs/SIGNING.md#verify-where-a-release-was-built).
- CodeQL and OpenSSF Scorecard analyze every change to `main`.

## [0.13.1] - 2026-10-25

### Removed

- The privacy Guardian, the experimental feature that read the screen and covered the picture with BE RIGHT BACK when a term from your list appeared. With it go the 12-second delay it added to the stream and the text recognition bundled in the installer. The reading models it had downloaded are deleted the first time you open the app.

### Changed

- Deck mode readiness on the phone counts the right safety nets: BE RIGHT BACK, auto-bitrate and the black screen alert.
- Telemetry no longer sends whether the Guardian was on.

## [0.13.0] - 2026-10-25

### Added

- Deck mode (optional): your phone becomes the stream's control panel over your home Wi-Fi, without an app or an account. Pair it from **Settings → General → Deck mode** by scanning a QR code and confirming a 4-digit code on the PC.
- Big buttons on the phone for Mark this moment, BE RIGHT BACK, the OBS microphone and scene, title and game, a chat message, pausing a single platform, End stream (hold for 1.5 s) and GO LIVE (hold for 1 s).
- Phone warnings that come with the fix: black screen, muted mic, lost OBS signal, a platform reconnecting, raids, gifts and mentions.
- Chat from every platform, the stream's health and the end-of-stream summary on the phone, in portrait, landscape or on a tablet.
- Per-device personalization (buttons, warnings, vibration, theme, left-handed mode and sizes) and combos that run several steps from one button.
- An optional deck mode step in the first-time setup.

### Security

- Deck mode only opens a port on the home network while it is on, accepts only devices you allowed and never sends stream keys, passwords or tokens to the phone. The connection is not encrypted, so it should not be used on public Wi-Fi.

## [0.12.0] - 2026-10-25

### Added

- Optional black screen alert: when the picture from OBS stays completely black for more than 10 s, Corneta warns you on the Live screen and with a Windows notification.
- Mark this moment also places a marker on the Twitch VOD when the Twitch account is connected and Twitch is on air.
- The Mark this moment button shows your global hotkey.
- Update notices: Corneta checks for a new version when it opens and every 6 hours, and notifies you from the tray, once per version and never mid-stream.

## [0.11.0] - 2026-10-22

### Added

- Twitch GIFs, giant emotes, 7TV zero-width emotes and 7TV emotes in Kick chat.
- Bits with the cheer's icon and color, links that open in the browser and highlighted mentions.
- Badges with images and their name on hover.
- Messages with context: replies, first messages, announcements, highlighted and paid messages, channel point redemptions, celebrations, `/me`, Twitch shared chat and platform notices.
- Pinned messages, polls and predictions at the top of the chat, with votes in real time.
- Visible chat modes: slow mode, followers-only, subscribers- or members-only, emote-only and no repeated messages.
- New alerts: gifted subscription continuations, pay-it-forward gifts, watch streaks, charity donations, YouTube gifts, KICKs, channel point redemptions, milestones, Hype Trains and shared chat.
- Synced moderation: a timeout or ban removes the person's messages from the app and the overlay.
- The message field respects each platform's limit, and the report replay keeps emotes, badges and highlights.

### Fixed

- Kick chat connects again after Kick changed its chat connection key; Corneta asks Kick for the current key on every connection.
- Kick channels with `_` in their name are found.

## [0.10.0] - 2026-10-20

### Changed

- New interface: screens grouped under **Streaming** and **Set up**, a Live screen with four readiness indicators and side drawers, and **GO LIVE** in a fixed bar that says what is still missing.
- A pending platform no longer holds up the others: Corneta goes live with the ready ones and tells you which one was left out.
- **Platforms** shows one row per destination with the single action still missing, and lists experimental platforms separately.

### Added

- Guided first-time setup that replaces the tour, available again from **About → Redo first-time setup**.
- With **YouTube on autopilot**, YouTube counts as ready without pasting a key; Corneta creates the broadcast and the key when you go live.

### Fixed

- With OBS closed, Corneta no longer says "OBS connected" next to an alert.
- Keyboard navigation highlights only the focused button instead of outlining the whole screen.

## [0.9.0] - 2026-10-19

### Added

- Reply from the chat to the channel the message came from.
- Timeout and ban on YouTube and Kick.
- Twitch follower alerts in the app.
- **Fetch from account** for the Twitch and Kick stream keys, straight into the Windows vault.
- Chat suggestions for the Twitch, YouTube and Kick accounts you signed in to.
- YouTube visibility and made-for-kids options for the automatic stream, the "watching" count without an API key and a warning when the daily quota runs out.
- **Smart** encoding mode and **Set it up for me** for the OBS video, with **Undo**.
- Global hotkeys for Mark this moment and BE RIGHT BACK.
- Export the stream's moments as YouTube chapters, CSV or EDL.
- Starting with Windows opens Corneta in the tray.

### Fixed

- Cleaning up old recordings only deletes videos Corneta can prove are its own.
- Importing settings keeps this computer's OBS password, YouTube API key and recording folder, and refuses malformed files.
- A dropped connection is no longer mistaken for a refused key.
- A wrong OBS password shows as **Password refused**.
- Changes made in the separate chat window are no longer lost, and sign-in opens the browser only once.
- FFmpeg and the local server close when Corneta closes suddenly.
- Leftover temporary replay files are cleaned up when the app opens.
- The interface is lighter during the stream.

## [0.8.5] - 2026-10-18

Versions 0.8.2, 0.8.3 and 0.8.4 were never published; their changes are included here.

### Changed

- Recording replay shows that it is opening, lets you retry or open the file in another player, and can prepare large recordings once so they open faster.
- Crash reports, when turned on, identify the exact app version.

### Fixed

- The maximize button of the separate chat window works again, and failed window actions show a message.

### Security

- `rustls` and `quinn-proto` were updated to versions without known flaws, and the updater no longer includes the unused ZIP extraction.

## [0.8.1] - 2026-09-10

### Added

- First release published on GitHub, with the Windows installer, `SHA256SUMS.txt` and the third-party compliance bundle.

[Unreleased]: https://github.com/pitroldev/corneta/compare/v0.13.1...HEAD
[0.13.1]: https://github.com/pitroldev/corneta/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/pitroldev/corneta/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/pitroldev/corneta/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/pitroldev/corneta/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/pitroldev/corneta/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/pitroldev/corneta/compare/v0.8.5...v0.9.0
[0.8.5]: https://github.com/pitroldev/corneta/compare/v0.8.1...v0.8.5
[0.8.1]: https://github.com/pitroldev/corneta/releases/tag/v0.8.1
