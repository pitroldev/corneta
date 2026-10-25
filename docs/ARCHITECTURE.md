# Architecture: where a change belongs

Reference: 0.7.0 line. This map describes responsibilities and implementation contracts.

```text
OBS → local ingest (MediaMTX) → live program → destinations
                                  │            ├─ copy
                                  │            └─ renditions/shareable encode
                                  ├─ local recording (isolated child)
                                  └─ metrics/events → NDJSON session

React ↔ Tauri API/IPC ↔ Rust commands ↔ runtimes and providers
Reports: local read → analysis worker → hooks/models → replay/chat/UI
Next.js site/API: setup/OAuth/manifests, not live transport
```

## Review map

| Responsibility                               | Entry point and nearby tests                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IPC registration, windows, tray and shutdown | [lib.rs](../src-tauri/src/lib.rs), [commands.rs](../src-tauri/src/commands.rs).                                                                                                 |
| Media arguments, engine state                | [engine.rs](../src-tauri/src/engine.rs), [engine_policy.rs](../src-tauri/src/engine_policy.rs); tests in the modules.                                                           |
| Platforms: destinations, chat and accounts   | [src/platforms](../src/platforms/index.ts) (one `destination.json` per folder), [src-tauri/src/platforms](../src-tauri/src/platforms/mod.rs); see below.                        |
| Encode reuse and program                     | [renditions.rs](../src-tauri/src/renditions.rs), [compositor.rs](../src-tauri/src/compositor.rs), [splicer.rs](../src-tauri/src/splicer.rs).                                    |
| Isolated recording                           | [recorder](../src-tauri/src/recorder/): pure domain, disk, FFmpeg and tests kept separate.                                                                                      |
| Reports and retention                        | [session](../src-tauri/src/session/): domain, storage, operations and tests.                                                                                                    |
| Auth/vault, chat and resources               | [auth.rs](../src-tauri/src/auth.rs), [keys.rs](../src-tauri/src/keys.rs), [chat.rs](../src-tauri/src/chat.rs), [resources.rs](../src-tauri/src/resources.rs).                   |
| Desktop/browser boundary                     | [api.ts](../src/lib/api.ts): selection facade; [api/](../src/lib/api/) separates contract, environment, IPC and demo.                                                           |
| Shared frontend state                        | [store.ts](../src/lib/store.ts): composition and persistence; [store/](../src/lib/store/) holds the types and the OAuth, chat and navigation slices.                            |
| Chat and settings                            | [ChatScreen.tsx](../src/screens/ChatScreen.tsx), [chat/](../src/screens/chat/), [SettingsScreen.tsx](../src/screens/SettingsScreen.tsx), [settings/](../src/screens/settings/). |
| Frontend reports                             | [report.ts](../src/lib/report.ts), [report.worker.ts](../src/lib/report.worker.ts), [reports](../src/screens/reports/), `report*` and `replay*` tests.                          |
| Site and setup                               | [web/app/api](../web/app/api/), [web/lib/server](../web/lib/server/), tests next to the contracts.                                                                              |
| Contributor tooling                          | [contributor.mjs](../scripts/contributor.mjs), [with-env.mjs](../scripts/with-env.mjs), [fixture safety](../scripts/report-fixture-safety.mjs).                                 |

## Ownership and shutdown

`AppState` holds the runtimes; `EngineRuntime` owns the MediaMTX/FFmpeg handles, the snapshot, the flags and the start generation. A session is claimed under the lock before the slow work; the generation stops a cancelled setup from installing processes from an old attempt. Do not replace this with a visual “starting” state.

Supervisors watch the running/paused/terminal-error flags. The shutdown path is the single place that ends the process trees, including the recorder. Closing to the tray does not stop the live. Recording/disk errors must not escalate the whole stream into an error: the priority is the stream, the report, the recorded chat and the video, in that order.

When reviewing async code, check lock duration, cancellation after every slow operation, queue limits, waiting on child processes and who owns the handle. Do not hold a `Mutex` across slow network/disk work without a demonstrated need; do not introduce an ownerless task that outlives shutdown.

## Persistence, memory and interface

The current session uses schema 4, with reports capped at 32 MiB and chat at 16 MiB, and an official retention of 50 sessions. Listing reads bounded tails; video is a separate file. The Contributor profile does not prune external recording directories. The constants and tests in `session/domain.rs` are the executable reference; do not raise the limits just to hide a load case.

The frontend loads screens/modules on demand. The worker moves heavy parsing/analysis off the interaction path; replay keeps the clock, segments and chat pagination separate. A marker must not invalidate the whole page or recreate the player. Preserve transferable buffers, bounded lists and narrow state subscriptions.

### Platforms

Each platform lives in its own folder, and the core only knows the registry.

- **Destinations** are data: each one is a `src/platforms/<id>/destination.json` (for example [`facebook`](../src/platforms/facebook/destination.json) and the RTMP [`custom`](../src/platforms/custom/destination.json)) with the order, color, icon, recommended preset, copy limits, whether it is experimental, the account that fills in the key, the setup order and capabilities such as `userServer` and `fallback`. The frontend gathers the folders with `import.meta.glob` ([`destinations.ts`](../src/platforms/destinations.ts)) and [`build.rs`](../src-tauri/build.rs) gathers the same files for the engine. A new destination is a folder with that file, plus its note and tagline in the dictionaries, without touching the Rust code or the screens; telemetry accepts the catalog ids.
- **Chat and accounts** are code. In Rust, each folder in [`src-tauri/src/platforms`](../src-tauri/src/platforms/mod.rs) implements `ChatProvider` (connection, sending, audience, moderation) and, if there is a login, `AccountProvider` (status, sign in and out, reading the key, live title, the account's channels, own credentials and automatic broadcast when going live); `chat.rs`, `auth.rs` and `commands.rs` keep the shared infrastructure and dispatch through the registry. In the frontend, [`src/platforms`](../src/platforms/index.ts) describes each platform's capabilities (channel normalization, how it sends, what moderation requires, how to read its own status) and `platforms/ui.ts` wires up each one's account panels and channel settings.
- [`registry.test.ts`](../src/platforms/registry.test.ts) fails if code outside the platform folders starts mentioning a platform id again.
- Each platform's network loops stay inside it; the reconnect supervisor, deduplication, session recording and the overlay belong to the core. The chat core defines the shared model (text, emote, GIF, sticker, link, mention and cheer fragments; highlights, replies, system lines, pinned messages, polls and modes), and third-party emotes (BTTV, FFZ, 7TV) live in [`platforms/emotes.rs`](../src-tauri/src/platforms/emotes.rs), used by Twitch and Kick.

### Frontend boundaries

`src/lib/api.ts` is the entry point used by the screens and the store. The `api/` directory separates four responsibilities:

- `types.ts`: the `CornetaApi` contract and shared payloads; command, event or format changes must stay in parity with Rust and with the demo.
- `native.ts`: Tauri invocations and subscriptions, dialogs and native resources. Every subscription returns its teardown function.
- `demo.ts`: browser simulation; its data and results do not prove a real stream, OAuth or local server.
- `runtime.ts`: Tauri detection and shared codes, including `START_CANCELLED`, which must stay identical to the Rust code regardless of language.

`src/lib/store.ts` creates a single Zustand instance per WebView. The slices in `store/oauth.ts`, `store/chat.ts` and `store/navigation.ts` receive the same `set`/`get` and the typed context in `store/types.ts`; they are not independent stores. The `saveChain` queue, the config revision, `persist` and `flushSave` belong to the composition in `store.ts`. Every config change must go through that queue; vault operations that depend on a freshly created namespace wait for `flushSave`. The `config://changed` sync applies incoming revisions without re-saving the same event, which avoids loops between windows.

The chat slice keeps the batch processing and the message/alert limits, plus the teardown of subscriptions and timers. The OAuth slice holds the configuration, modes and flow state; switching between own and official credentials is not the same as deleting them. The navigation slice keeps consumable focus, tab and screen requests. The tests in [store.slices.test.ts](../src/lib/store.slices.test.ts) cover credential deletion failures, sync without re-saving and chat batch cleanup; they do not replace a real run against the providers.

`ChatScreen.tsx` and `SettingsScreen.tsx` are the entry points and coordinators of their screens. `screens/chat/` groups accounts, sources, alerts, overlays, primitives and constants; `screens/settings/` groups BE RIGHT BACK, recording, the OBS test, shortcuts and previews. These components use the existing design system and the shared store/API. An extraction must not create another global subscription, config queue or persistent local copy of the same state.

## How to extract modules without stopping the product

Extract when you change a concrete responsibility: pure policy, external adapter and a controller with an explicit lifecycle. Keep the IPC contracts and events, use before/after behavior tests and do not mix an extraction with a format change. The session/recorder modules, the reports screen and the API/store boundaries above are existing examples. Environment parsing/invocation and fixture safety also have testable boundaries. Size alone does not justify rewriting media modules.

See also [configuration](CONFIGURATION.md), [network surface](NETWORK-SURFACE.md), [compatibility](COMPATIBILITY.md) and [performance](PERFORMANCE.md).
