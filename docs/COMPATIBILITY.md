# Compatibility and upgrades

Reference: desktop line 0.7.0 for Windows x64.

| Surface         | Current contract                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Desktop         | Windows x64, Tauri/WebView2 and the toolchain pinned in the repository; hardware/drivers still need validation with real media.    |
| Other platforms | macOS, Linux and Windows ARM have no validated distribution; compiling is not the same as supporting.                              |
| Demo            | Chromium browser, simulated state; does not test the vault, OBS, OAuth or native GPU.                                              |
| OBS             | obs-websocket v5 integration; the video signal goes into the local ingest server. Permissions and network still matter.            |
| API/website     | Web workspace with its own version; payload/manifest checks and origin policies must stay compatible with the desktop app.         |
| Reports         | NDJSON plus separate chat/video files; parsers have tested legacy support. Do not edit versions by hand to force acceptance.       |
| Settings/vault  | Migrations live in the native layer; secrets do not belong in the exportable JSON. Settings from a future version may be rejected. |
| Contributor     | Its own identifier: it must not automatically use the vault, updater or data of the official installation. It is not a sandbox.    |

Before changing a format, add old fixtures, test reading, migration and missing fields, and document what changes. Never fix an incompatibility by silently deleting data. The language catalogs are in `src/lib/i18n/` and `web/lib/i18n/`.

Before a real upgrade, end the stream and preserve settings, reports and videos using a procedure suited to your installation. A file backup does not guarantee that the Windows vault is portable. Test the update on a disposable account/VM and check that data is preserved and sidecars shut down. Do not run development builds against the production profile.

Downgrades are not guaranteed: an old version may not understand new data. The updater signature authenticates the artifact; checksums and Authenticode play different roles. See [signing](SIGNING.md) and [auto-update](AUTO-UPDATE.md).
