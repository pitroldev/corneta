# Changelog

Notable changes to Corneta, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). The
[release notes](https://github.com/pitroldev/corneta/releases) carry the same changes
in English and Portuguese, with the installers.

## [Unreleased]

### Added

- A rehearsal without an audience, in first-time setup and on the Live screen. For about 30 seconds Corneta sends what OBS is producing to Twitch's test mode and to a private YouTube broadcast, then shows the frame that arrived and what each platform said. Platforms that have no test mode, or have no stream key yet, are left out and say which, and the real stream key is never used for a rehearsal.
- The OBS step shows three lights (OBS open, remote control on, stream pointed at Corneta) that turn on by themselves, with one instruction at a time, instead of only saying that OBS was not found. Corneta now reads the WebSocket port and password from OBS's own settings, so the password is asked for only when OBS refuses it.
- "I pasted them into OBS": setting OBS up by hand now counts as ready when OBS can't be reached to confirm it.
- The OBS step asks which program you stream with: OBS Studio, Streamlabs or another app. Corneta picks Streamlabs for you when it is on the PC and OBS is not, and you can change the answer at any time. Outside OBS it shows the two fields to paste, and since it can't press play there, the rehearsal and the go-live message ask you to start the stream in that program.
- The empty chat offers the channels of the accounts you already signed in to, in one click.
- After your first live, the Live screen offers the phone panel once.

### Changed

- First-time setup has three steps (platforms, OBS, rehearsal) instead of six. The upload test runs in the background, and the phone panel moved out of setup.
- BE RIGHT BACK is on by default in new installs. Existing installs keep their setting.
- When going live fails, the error names the cause and offers the fix that fits it. If another program holds the port OBS sends to, one button moves Corneta to a free port, points OBS at it and tries again. The support codes moved under "Ask for help", and the panel no longer repeats itself in a toast.
- The go-live shortcut asks for a second press before ending a live.
- The Protections card only shows a check when the recommended protections are on.

### Fixed

- The OBS tip on the Live screen no longer says Simple mode is already right: Simple mode doesn't expose the keyframe interval.
- "About" no longer gets cut off in the sidebar at the smallest window size.

## [0.15.1] - 2026-11-15

### Changed

- Destinations that Corneta re-encodes with an NVIDIA card now decode, scale and encode on the card, which cuts the processor work of each one to about a fifth. If the card refuses, the destination goes back to the previous path on its own.

### Fixed

- Auto-bitrate now reacts to a network drop late in a long live. Before, it followed FFmpeg's average speed since the connection opened, which barely moves after the first hour.
- The chat reconnects when its Twitch, Kick or Cinefy connection dies silently. Before, it could stop receiving messages while still showing as connected.
- A settings file that Corneta can't use is kept under another name, and Corneta tells you, instead of being replaced by the defaults on the next change.
- When your settings can't be saved, Corneta says so, and going live saves them again first instead of starting with the previous settings.

### Security

- An imported settings file can no longer name a destination after one of Corneta's own vault entries, which would have sent an account token as that destination's stream key when going live.

## [0.15.0] - 2026-11-15

### Added

- When YouTube warns about the stream's settings during a live, such as a keyframe interval outside its recommendation, the destination's row offers "Fix it now": Corneta re-encodes that destination until the live ends, following its preset's keyframes, bitrate and frame rate. The row also shows where to change the setting in OBS, so the warning doesn't come back next time.

### Changed

- Destinations that Corneta encodes with x264 use the veryfast preset, which keeps up with a live on a typical streaming PC.

### Fixed

- If the GPU encoder fails mid-live for a destination that Corneta encodes, that destination switches to x264 until the live ends instead of failing again on every reconnect, and Windows says so.
- A destination stuck on a dead connection now reconnects on its own: after 15 seconds without sending anything, or after 25 seconds when the platform never finishes opening the connection. Before, it could keep showing LIVE while sending nothing.
- Going live waits for the ingest server to answer before opening the automatic YouTube broadcast, so a server that fails to start no longer opens a broadcast for nothing.
- The Live screen lists the destinations that are actually streaming. Switching a destination off or changing profiles mid-live no longer hides one that is still on air, the "on air" count no longer goes past the total, and a destination without a URL no longer sits in Connecting.
- The chat's Alerts button keeps pulsing and counting after the 100th alert.
- The pop-out chat's "Open Corneta" button brings the main window back when it is hidden in the tray.
- Pausing a destination, ending or cancelling a live, the go-live shortcut, the start-with-Windows switch and opening the pop-out chat now show an error when they fail, instead of failing silently.

## [0.14.0] - 2026-11-15

### Added

- During a live, each destination whose account is signed in shows whether the platform itself confirms the live. YouTube also passes on its own grade of the stream, such as a keyframe interval outside its recommendation.

### Fixed

- If the ingest server or the BE RIGHT BACK publisher crashes mid-stream, Corneta restarts it on its own and the live carries on: viewers see the BE RIGHT BACK screen for a few seconds while OBS reconnects, and the PC and the paired phone say the ingest server is back. After three ingest server crashes within two minutes, the live still ends with an error.
- When a live ends because of an error, or a start is cancelled after the automatic YouTube broadcast was opened, Corneta now ends that broadcast instead of leaving it on air without video.

## [0.13.3] - 2026-11-15

### Added

- The website and README link to Corneta's official Microsoft Store listing alongside the standalone Windows installer.
- The website footer and the README show Product Hunt's review badge, linking to Corneta's Product Hunt page. The website serves its own copy of the badge, so visitors never load anything from Product Hunt.

### Changed

- The website's deck mode section shows the phone lying sideways like a stream deck, with what the main buttons do and how a combo runs several steps from one button.

### Fixed

- The pop-out chat no longer sends crash reports for a harmless browser warning while messages resize. It now measures message heights on the next frame, so the warning stops firing.
- When another program, or a port reservation by Windows, blocks one of Corneta's local ports, the error shown when going live now names that port. Before, Windows users only saw that the ingest server crashed.
- Stopping a live and going live again right away no longer ends the new live with a false "ingest server crashed" error from the previous session's server.
- A closed OBS or a rejected OBS password no longer counts as a Corneta crash when Corneta starts or stops the OBS stream for you.
- Website error reports keep the stack details that error tracking needs to group them.

### Security

- Usage data and crash reports from the app no longer let the analytics service work out an approximate location (city and coordinates) from the connection, as the privacy policy promises. The app's native crash reports and the website already worked this way.
- The ingest server no longer opens an unused MoQ listener on port 8892 on every network interface.
- Website error reports remove local file paths from stack frames.

## [0.13.2] - 2026-11-01

### Added

- Microsoft Store installations can check for updates inside Corneta and request installation through the Store, with progress, cancellation handling and protection against updating during a stream.
- A Microsoft Store MSIX build with verified package identity, isolated settings and credentials, Store-managed updates, and Windows startup-task support.

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

[Unreleased]: https://github.com/pitroldev/corneta/compare/v0.15.1...HEAD
[0.15.1]: https://github.com/pitroldev/corneta/compare/v0.15.0...v0.15.1
[0.15.0]: https://github.com/pitroldev/corneta/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/pitroldev/corneta/compare/v0.13.3...v0.14.0
[0.13.3]: https://github.com/pitroldev/corneta/compare/v0.13.2...v0.13.3
[0.13.2]: https://github.com/pitroldev/corneta/compare/v0.13.1...v0.13.2
[0.13.1]: https://github.com/pitroldev/corneta/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/pitroldev/corneta/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/pitroldev/corneta/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/pitroldev/corneta/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/pitroldev/corneta/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/pitroldev/corneta/compare/v0.8.5...v0.9.0
[0.8.5]: https://github.com/pitroldev/corneta/compare/v0.8.1...v0.8.5
[0.8.1]: https://github.com/pitroldev/corneta/releases/tag/v0.8.1
