# Configuration: development, official distribution and forks

Reference: 0.7.0 line. You do not need the maintainer's credentials to contribute. Examples without real values: [root](../.env.example) and [site/API](../web/.env.example). Surfaces and limitations: [network and integrations](NETWORK-SURFACE.md).

## Choose the profile before configuring

| Goal                                                        | Commands/profile                                 | Credentials and services                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Try the screens with fictitious data                        | `pnpm contrib:demo`                              | No `.env`, OBS, Rust or OAuth. Does not stream.                                                                                               |
| Develop the site or run checks                              | `pnpm contrib:web`, `pnpm contrib:check`         | Filtered environment; telemetry off. No production secrets required.                                                                          |
| Develop the native desktop app                              | `pnpm contrib:app:dev`, `pnpm contrib:app:build` | Its own identifier/vault, no updater, installer or telemetry. Requires the toolchain/sidecars; do not run it at the same time as a real live. |
| Test real integrations under the developer's responsibility | `pnpm app:dev` + `pnpm web:dev`                  | Your own credentials for the feature you need; the official wrapper may load the root `.env`.                                                 |
| Distribute the official Corneta                             | `pnpm app:build` and release gates               | The maintainer's infrastructure, keys and reviews. A build is not authorization to publish.                                                   |
| Distribute another product/fork                             | There is no complete white-label profile yet     | Requires its own identity, endpoints, policies and credentials; see the limitations below.                                                    |

The contributor profile uses [`scripts/contributor.mjs`](../scripts/contributor.mjs) and [`tauri.contributor.conf.json`](../src-tauri/tauri.contributor.conf.json). It does not read the root `.env` and refuses to run the site if there are real `.env*` files in `web/`, because Next also loads them automatically. Use a clean clone/worktree; do not delete personal files to satisfy the command. `.env.example` files are allowed.

This profile is not a sandbox: giving the same code a separate identity does not isolate ports, OBS, devices, shortcuts or access to files the user selects. Nor does it turn an external integration into a local service.

## Who loads each file

| Consumer               | Input and timing                                                | Precedence/exposure                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/with-env.mjs` | Root `.env`, when running `app:dev`/`app:build`                 | The inherited environment wins, even an empty value. Values from the file go only into the child's environment, secrets included. Does not modify the launcher's `process.env`.            |
| Desktop Vite           | Vite's dotenv files, outside the contributor profile; build/dev | Exposes `VITE_*` and `TAURI_ENV_*` to the frontend. Everything under these prefixes must be public. The root file is not a vault.                                                          |
| `src-tauri/build.rs`   | Root `.env` in a non-contributor native build                   | Reads only `POSTHOG_DESKTOP_TOKEN`, `POSTHOG_HOST`, `TELEMETRY_DISABLED`, `CORNETA_BUILD_SHA`; a value present in the environment wins. These public values may be embedded in the binary. |
| Next site/API          | dotenv files in `web/` and the process environment              | `NEXT_PUBLIC_*` may be inlined into the browser bundle; variables without that prefix stay available to server code.                                                                       |
| `web/next.config.ts`   | Also reads the root `.env`, only in non-contributor development | Uses `process.loadEnvFile` without overwriting variables already loaded. On deploy, provide the configuration to the server; do not rely on the personal root file.                        |
| Publishing gates/CI    | Environment explicitly provided by the runner                   | Secrets limited to the job that needs them; do not expose official keys to untrusted PR code.                                                                                              |
| Installed app          | App configuration + native vault                                | Does not depend on the repository `.env`. The user's OAuth tokens/stream keys are not public build variables.                                                                              |

In development, keep server values in `web/.env.local` where possible, so they do not propagate to desktop build subprocesses. Set each variable in a single place; conflicts between files make diagnosis needlessly hard. `contrib:*` must run without these site files.

### Parsing contract

The wrapper uses `node:util.parseEnv` on the Node version pinned by the project. It accepts single/double quotes, comments, whitespace, the `export` prefix, empty values and quoted multiline values. It does not interpret values as commands. The quote/comment syntax follows the [Node dotenv specification](https://nodejs.org/docs/latest-v24.x/api/environment_variables.html#dotenv).

Additional rules tested in [`with-env.test.mjs`](../scripts/with-env.test.mjs):

- The inherited environment wins even when it contains `VAR=`; on Windows, names are compared case-insensitively.
- Repeated entries follow the native parser; avoid duplicates. `with-env` does not expand `$VAR`, `${VAR}` or `%VAR%`, and does no command substitution.
- A missing file is normal in CI. Permission/read errors stop the command with a message that does not print contents, values or private paths.
- The Rust loader **is not a full dotenv parser**: it works line by line, drops empty values, does not support `export`/multiline and does not strip end-of-line comments. For the four public variables shared with Rust, use plain `NAME=value`, with no inline comments, expansion, duplicates or multiline values. Comments must be on their own line.
- An empty password `TAURI_SIGNING_PRIVATE_KEY_PASSWORD=` is preserved by the wrapper. Do not confuse an intentionally empty value with a missing variable.

`with-env` runs the child with `shell: false`: arguments containing spaces, quotes, `&`, `|`, `$` or `%` stay arguments. `tauri`/`tauri.cmd` are resolved to the installed JavaScript entry point and run by the launcher's own Node. Other `.cmd`/`.bat` files on Windows are not supported: use a native executable or `node path/cli.js`. Do not pass a compound line such as `"command && other"`.

This does not stop an explicitly invoked program from interpreting its own arguments as code. Run only trusted tools: they and their subprocesses receive the loaded secrets. Credential-free isolation belongs to the contributor profile; protection against secrets ending up in artifacts also depends on the allowlists and on `bundle:check`/`artifacts:check`.

## Variable matrix

“Public” means fine for the client to know, not permission to publish personal credentials. Example values are structural or empty; do not use fixture identifiers as real credentials.

### OAuth and site identity

| Variable                                             | Consumer/timing               | Classification                  | When to set it/safe example                                                                                                                                              |
| ---------------------------------------------------- | ----------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VITE_TWITCH_CLIENT_ID`                              | Desktop, build                | Public                          | Direct Twitch OAuth; empty disables the embedded credential. Public client type.                                                                                         |
| `TWITCH_CLIENT_ID`                                   | Bootstrap API, request        | Public                          | Preferred server name; falls back to `VITE_TWITCH_CLIENT_ID`. The current public flow requires no Twitch secret.                                                         |
| `VITE_GOOGLE_CLIENT_ID`                              | Desktop, build                | Public                          | Desktop-type Google client for direct PKCE.                                                                                                                              |
| `GOOGLE_CLIENT_ID`                                   | Bootstrap API, request        | Public                          | Preferred on the server; falls back to `YOUTUBE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID`. Use the same official desktop client.                                            |
| `YOUTUBE_CLIENT_ID`                                  | Bootstrap API, request        | Public                          | Compatibility alias; prefer `GOOGLE_CLIENT_ID` and do not set conflicting values.                                                                                        |
| `VITE_KICK_CLIENT_ID`                                | Desktop, build                | Public                          | Official Kick client; not enough to enable the broker without a configured server.                                                                                       |
| `KICK_CLIENT_ID`                                     | Bootstrap/broker API, request | Public                          | Preferred on the server; falls back to `VITE_KICK_CLIENT_ID`. Must match the secret.                                                                                     |
| `KICK_CLIENT_SECRET`                                 | Broker API, request           | **Secret, server**              | Required for the official Kick exchange/refresh. Never `VITE_*`/`NEXT_PUBLIC_*`. Locally it can live in `web/.env.local`.                                                |
| `KICK_REDIRECT_URIS`                                 | Broker API, request           | Public, configuration-sensitive | Exact list of allowed callbacks. Default `http://localhost:7395/callback`; the official gate only allows that address and its `127.0.0.1` variant. Do not use wildcards. |
| `VITE_SETUP_API_URL`                                 | Desktop, build                | Public                          | Empty in dev uses `http://localhost:7390`; a release requires an HTTPS setting for the brokered login. Official: `https://www.corneta.live`.                             |
| `NEXT_PUBLIC_SITE_URL`                               | Site, build                   | Public                          | Current production builds require `https://www.corneta.live`, metadata included. There is no safe auto-detection of a fork's domain.                                     |
| `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION` | Site, render/build            | Public                          | Domain ownership verification tokens; optional in development. Not OAuth.                                                                                                |

The site serves `/download` with no environment variable or secret: it resolves the official release's public `latest.json` to the versioned Windows `.exe` installer, validating repository, platform and version. A valid redirect may be cached on the CDN for five minutes; an invalid or unavailable manifest falls through to the official `releases/latest` page, uncached. The [desktop updater](AUTO-UPDATE.md) keeps its own endpoint and signature check, independently of the site.

Google/Kick **BYOK** credentials are entered in the app's advanced settings and stored in the native vault; they must not become `VITE_*_SECRET`. Google BYOK uses the legacy flow for TVs/limited-input devices; it is not interchangeable with the official flow's desktop client. Access/refresh tokens, the OBS password, the optional YouTube read API key and stream keys belong to the user; they must not go into examples, fixtures, screenshots or real commits.

### Setup API protection

| Variable                                        | Consumer/timing       | Classification      | When to set it/safe example                                                                                                      |
| ----------------------------------------------- | --------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `OAUTH_TRUSTED_IP_HEADER`                       | Rate limiter, request | Trust configuration | Self-host: name of the header the proxy **overwrites**, never appends to. Next must not be directly reachable from the Internet. |
| `CORNETA_RELEASE_CHECK`                         | Next build/gates      | Public control      | `1` turns on the official gates outside Vercel; do not use `0` to pretend an incomplete deploy is ready.                         |
| `VERCEL`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA` | Infrastructure/Next   | Deploy metadata     | Provided by the platform; production turns on the gates. Do not fake these values to bypass security.                            |

The limiter uses local memory in every environment, with up to 10,000 entries per instance. Each origin has independent per-route counters: 20 exchanges and 60 refreshes per fixed 60-second window. IPv6 is grouped by /64; without a trusted IP, requests share the route's `unknown` origin. On Vercel, the origin header is selected automatically; on self-host, keep the proxy boundary described in the table.

Cache keys are derived with HMAC-SHA256 using a random 32-byte key created when the limiter starts and kept only in the process. There is no configurable secret or remote storage for these counters. OAuth tokens do not enter the cache: the broker handles them transiently to answer the desktop app. When the limit is hit, it responds `429`/`Retry-After`; with no room for a new entry, it responds `503`/`Retry-After` without evicting active counters.

**The limit is not shared between instances.** Restarting or scaling creates new counters; local memory does not set a global quota or a cost ceiling. Shared protection in front of the instances depends on a WAF/edge configured on the host, with verified scope and behavior. The [network surface](NETWORK-SURFACE.md) describes the coverage of the Kick routes; no environment variable proves that this protection is active.

### Telemetry and artifact identity

| Variable                                                                          | Consumer/timing                                  | Classification                             | When to set it/safe example                                                                                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `VITE_POSTHOG_TOKEN`, `VITE_POSTHOG_HOST`                                         | Desktop frontend, build                          | Public                                     | Ingestion project token and host; empty makes the integration unavailable/no-op. Do not use a Personal API Key.          |
| `POSTHOG_DESKTOP_TOKEN`, `POSTHOG_HOST`                                           | Rust, build; host also used by the server/plugin | Public                                     | `build.rs` allowlist; in the official release, keep token/host aligned across surfaces.                                  |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST`                   | Site browser, build                              | Public                                     | Site ingestion token; the current official host is `https://us.i.posthog.com`.                                           |
| `POSTHOG_PROJECT_TOKEN`                                                           | API telemetry, server                            | Public for ingestion, kept on the server   | Preferred on the server; falls back to `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`.                                              |
| `VITE_TELEMETRY_DISABLED`, `TELEMETRY_DISABLED`, `NEXT_PUBLIC_TELEMETRY_DISABLED` | Respective consumers, build/server               | Public controls                            | `1` turns off that surface. The contributor profile forces it off; it does not reset the user's consents.                |
| `VITE_BUILD_SHA`, `CORNETA_BUILD_SHA`, `NEXT_PUBLIC_BUILD_SHA`, `BUILD_SHA`       | Desktop frontend/Rust/site/API                   | Public                                     | Full commit SHA; the official release requires a consistent identity.                                                    |
| `NEXT_PUBLIC_DEPLOYMENT_ENV`, `POSTHOG_ENVIRONMENT`                               | Site/API                                         | Public                                     | `development` in local tests; environment metadata, not credentials.                                                     |
| `POSTHOG_API_KEY` / `POSTHOG_CLI_API_KEY`, `POSTHOG_PROJECT_ID`                   | Source map plugin and gate, build/CI             | **Secret key**; the ID is project metadata | Authorized publishing jobs only. Do not embed, log or prefix with `VITE_`/`NEXT_PUBLIC_`.                                |
| `REQUIRE_POSTHOG_SOURCE_MAPS`, `POSTHOG_CLI_DRY_RUN`, `POSTHOG_CLI_BINARY_PATH`   | Vite/plugin, build                               | Tool controls                              | When on, the official gate requires a real upload; the CLI path must point to a trusted tool. Not options for app users. |
| `NEXT_TELEMETRY_DISABLED`                                                         | Next tooling                                     | Tool control                               | `1` turns off the Next tool's telemetry; it does not replace Corneta's kill switches.                                    |

The desktop policy separates **opt-in usage** (`unset` is off; only `enabled` allows sending) from **opt-out error reports** (`unset` is on; `disabled` blocks sending). Explicit `enabled`/`disabled` choices are preserved when the notice changes, with no new persistence schema. Turning usage on only allows future events; it does not recover steps from before the opt-in. The site keeps a single opt-out control, independent of the desktop app. See the [privacy policy](https://www.corneta.live/legal/privacy); the technical documentation does not certify a legal basis or the legal validity of older choices.

### Build and signing

| Variable                                  | Consumer/timing               | Classification       | When to set it/safe example                                                                                           |
| ----------------------------------------- | ----------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`               | Tauri, packaging/updater      | **Secret**           | Only for signed publishing under your responsibility. Not needed for `contrib:app:build`.                             |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`      | Tauri, packaging              | **Secret**           | Key password; an explicit empty value is allowed if the key was generated without a password.                         |
| `RUSTC_WRAPPER`                           | Cargo                         | Tool configuration   | An explicit value wins, even an empty one. With no value set, the wrapper detects `sccache` with a 3 s timeout.       |
| `CORNETA_CONTRIBUTOR`, `VITE_CONTRIBUTOR` | Launchers/build/app           | Internal controls    | Use the `contrib:*` commands; setting just one flag by hand does not reproduce the full isolation.                    |
| `CARGO_TARGET_DIR`, `NEXT_DIST_DIR`       | Compilation                   | Local paths          | Contributor keeps Rust artifacts separate; output directories must not point to personal files.                       |
| `TAURI_DEV_HOST`, `TAURI_ENV_*`           | Tauri/Vite, development/build | Public tool controls | The `TAURI_ENV_*` prefix is also exposed to the frontend. Changing the dev host can expose the server to the network. |

Updater signing and the Authenticode certificate are separate mechanisms. See the [signing policy](SIGNING.md) and the [release gates](RELEASE-GATES.md); do not share the maintainer's keys with a fork.

## Fork/self-host: a stated limit, not a security shortcut

There is a usable contributor profile, but **there is still no white-label distribution that works through variables alone**. Production domain/canonical, download links, backend gates, identifier/publisher and updater still protect the official distribution. A contributor build of the site is not approval to host a public copy.

Before distributing a fork, whoever is responsible must implement/review all of the following together:

1. Their own name, brand, app identifier, vault namespace and data directories; do not take on the maintainer's identity.
2. Their own domain/canonical, releases repository, download allowlist, API and callbacks in explicit configuration, keeping the official restrictions.
3. Their own OAuth apps; the Kick secret only on their server. Google/Twitch use public IDs, but quotas, verifications and availability belong to their own registration.
4. Their own updater key and endpoint; do not let a fork fetch the original project's updates or telemetry data.
5. Analytics off in the fork at first, until there is configuration and disclosure suited to its audience; test tokens must not feed production.
6. Local limits and verified WAF/edge protection, HTTPS proxy, privacy policy, retention, security contact channel and licenses/source packs for the binaries under their responsibility.

Files that enforce these boundaries: [`site.ts`](../web/lib/site.ts), [`download.ts`](../web/lib/download.ts), [`release-config.ts`](../web/lib/server/release-config.ts), [`tauri.conf.json`](../src-tauri/tauri.conf.json), [`keys.rs`](../src-tauri/src/keys.rs) and [`contributor.mjs`](../scripts/contributor.mjs). Do not remove a global validation or quietly swap the official host to make a fork pass.

## Validate without exposing values

- Run the tests in `scripts/with-env.test.mjs` and `scripts/contributor.test.mjs` with the pinned Node; the first uses only fictitious strings and does not open the real `.env`.
- Run `pnpm contrib:check` for the credential-free track. For a real integration, check only presence/absence and the flow's result; never dump `process.env`.
- When publishing, run the existing bundle, artifact, telemetry and compliance gates. A parsing test does not prove that there are no secrets in the history or in an installer.
- Revalidate this document when adding variables, consumers or aliases; update the examples and tests in the same PR.
