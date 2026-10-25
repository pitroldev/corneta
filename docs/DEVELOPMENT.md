# Development without official credentials

This guide is for contributing code. It does not set up an official distribution, does not install the app and does not start a stream automatically.

## Prerequisites

For the demo and the site, use Node.js **24.18.1** and pnpm **11.18.0**. For the native desktop app, the target is **Windows x64**, with Rust **1.97.1**, Visual Studio Build Tools/C++/MSVC, Windows SDK, PowerShell 7 and WebView2 Runtime. Tool versions are pinned in the repository files.

Use any version manager you like. Check `node --version` and `pnpm --version` in the same terminal you will run the project from; a pnpm shim may use a different Node from the one you just selected. `sccache` is optional, never a requirement to get started.

```sh
git clone https://github.com/pitroldev/corneta.git
cd corneta
pnpm install --frozen-lockfile
```

Installation needs to fetch dependencies from the registry or from an already populated local cache. The profiles turn off the application's telemetry; they do not make dependency installation or tool downloads offline operations.

## Choose what you want to develop

| Command at the root      | Result                                                       | Does not validate                                   |
| ------------------------ | ------------------------------------------------------------ | --------------------------------------------------- |
| `pnpm contrib:demo`      | React UI with a simulated engine at `http://localhost:1420`  | OBS, vault, encoder, real accounts                  |
| `pnpm contrib:web`       | Local Next.js site/API at `http://localhost:7390`            | Configured OAuth, WAF/edge and production operation |
| `pnpm contrib:check`     | App tests/checks and site quality/build                      | Native tests and publishing                         |
| `pnpm contrib:web:check` | Site quality/build without the calendar-based editorial gate | Official site release gates                         |
| `pnpm contrib:app:dev`   | Contributor Tauri app                                        | Installation or a validated live                    |
| `pnpm contrib:app:build` | Contributor native executable, no bundle                     | Installer, signing, distribution compliance         |

The contributor commands do not accept arbitrary override arguments. They keep a restricted set of machine/toolchain variables and strip inherited OAuth, signing and analytics settings. They explicitly provide the kill switches and the public settings the checks need.

## Environment files

You do not need to create a `.env` to use the `contrib:*` commands.

- In the contributor profile, the root `.env` is not loaded by Vite, by Next's manual loading or by the Rust build.
- Next.js also looks for its own files automatically. That is why `contrib:web`, `contrib:web:check` and `contrib:check` refuse real `web/.env`, `.env.local` and development/production/test variants. `.env.example` is allowed.
- If your copy already has these files, use another clean clone. You do not need to delete or move existing credentials.
- The site build uses `https://www.corneta.live` only to pass the canonical metadata validation. It uses no official secrets and does not authorize publishing a fork under that identity.
- In an environment explicitly marked as the official release/production, the wrapper refuses to replace the gates with the contributor profile.

`pnpm dev`, `web:dev`, `web:check`, `app:dev` and `app:build` are paths for development/configured operation, not equivalents of the isolated commands. `web:check` checks quality and integrity; calendar-based overdue review stays in the site's publishing gates, not in the regular check. See [configuration](CONFIGURATION.md), [network and OAuth](NETWORK-SURFACE.md) and [official gates](RELEASE-GATES.md) before operating with your own credentials.

## Contributor desktop app

Prepare the verified sidecars once in the clone:

```powershell
pwsh -NoProfile -File scripts/fetch-binaries.ps1
pnpm contrib:app:dev
```

The script downloads FFmpeg/MediaMTX and verifies SHA-256. The mode that uses a system FFmpeg is only an advanced development alternative; it produces no evidence of compatibility with the official binary.

The native identity is `br.com.pitroldev.corneta.contributor`. Configuration and reports follow that profile's directory; the vault service also uses its own identity. The updater plugin is not registered in this build, and telemetry is turned off at compile time. Rust artifacts go to `.artifacts/contributor/target/`, apart from the official artifacts.

```sh
pnpm contrib:app:build
```

Runs Tauri with `--no-bundle`. It does not need the official key, does not produce NSIS and neither installs nor runs the result. Do not distribute this executable as if it were an approved release.

### Isolation limits

The profile is not a virtual machine. OBS, ingest/callback ports, global shortcuts, GPU, CPU and folders you pick by hand are still resources of the same machine. Close the Corneta you use in production before testing the native build; do not do this during a real live. Use a test profile and test scenes in OBS too. Check the target location before importing settings, generating fixtures or selecting a recording folder.

It is not a sandbox for running malicious PR code either: build and application processes still run with your user's permissions on the system. Review code and dependencies before running them; use a disposable VM when you need real security isolation.

Automatic recording cleanup in Contributor is restricted to its own sessions folder. Custom/imported folders are neither scanned nor pruned by this profile; when recording into them, handle retention manually. This keeps an empty test report index from treating the real installation's videos as orphans. Deletions the user explicitly requests still require care with the chosen path.

To test ingest, use the values shown in the UI itself, check that the port is free and only then configure a test OBS profile. Do not change real OBS settings, autostart or destinations just to explore the interface; that is what the demo is for.

## Tests, formatting and artifacts

The [contributing guide](../CONTRIBUTING.md) describes commands per area and invariants. `contrib:check` does not include signing, installation or calendar-based overdue editorial review; those controls stay in the official operation's own paths.

| Command                                              | Scope                                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`                                          | App, root JS/TS scripts and tool configs. The site uses its own ESLint in `web:check`.                                   |
| `pnpm format:check`                                  | App, web, scripts, configuration and documentation recognized by Prettier; Rust/PowerShell sources have their own tools. |
| `pnpm format`                                        | Fixes new/modified sources; does not normalize the untouched historical debt in the baseline all at once.                |
| `node scripts/check-format.mjs --all`                | Also reports the historical debt; `pnpm format:all` rewrites it and must be a deliberate, separate normalization change. |
| `pnpm docs:check`                                    | Local Markdown link targets, without querying external URLs or anchors. Works in a clone or a source snapshot.           |
| `pnpm scripts:check`                                 | Syntax of all JS/MJS/CJS sources, without running the scripts. Does not replace lint/tests.                              |
| `pwsh -NoProfile -File scripts/check-powershell.ps1` | Parses the PowerShell scripts without running downloads/installation.                                                    |
| `pnpm smoke:reports`                                 | Report flows in Chromium; also run in CI in PT/EN.                                                                       |

The formatting baseline uses exact hashes (normalized only for LF/CRLF) and the pinned Prettier version. Once you modify a file covered by the baseline, the exception no longer applies: format it. Do not add hashes to hide new errors. EditorConfig/Gitattributes guide edits and checkouts; normalization changes must be deliberate and kept separate from behavior changes.

Builds write local artifacts to `dist/`, `web/.next/` and ignored caches. Do not run `contrib:web:check` or another Next build at the same time as `contrib:web` in the same copy. For concurrent tasks, use separate copies. Do not share `target` between official and contributor build profiles.

The first native build can take several minutes and use a lot of disk/memory. There is no measured minimum requirement for every machine combination. Keep the caches between iterations and see the [performance contract](PERFORMANCE.md), without treating one machine's measurements as a guarantee for others.

The existing smoke test can be run after building the frontend: `pnpm smoke:reports`. It requires Chromium/Edge and uses a disposable profile and simulated data. The browser path can be passed as an argument. Do not mistake this test for proof of native video playback or OAuth on a real account.

### Native integration tests

The `ignored` media tests use `ffmpeg` and `ffprobe` from the `PATH`. The
default download prepares suffixed sidecars for Tauri but does not install these
commands. To prepare both tools from the same verified archive, run this block
in **PowerShell 7, at the root of a clean contributor clone**:

```powershell
$cornetaMediaTools = Join-Path (Get-Location) '.artifacts/media-tools'
pwsh -NoProfile -File scripts/fetch-binaries.ps1 -ToolDirectory $cornetaMediaTools
if ($LASTEXITCODE -ne 0) { throw 'Failed to prepare the verified media tools.' }
$cornetaPreviousPath = $env:PATH
try {
    $env:PATH = "$cornetaMediaTools$([System.IO.Path]::PathSeparator)$cornetaPreviousPath"
    cargo test --manifest-path src-tauri/Cargo.toml --locked --lib splicer -- --ignored --test-threads=1
    if ($LASTEXITCODE -ne 0) { throw 'Media integration tests failed.' }
} finally {
    $env:PATH = $cornetaPreviousPath
}
```

Do not combine `-ToolDirectory` with `-AllowSystemFfmpeg`. The tools go to
`.artifacts/media-tools/`; the block restores the session `PATH` and starts
neither the app nor a live. The tests generate synthetic media in temporary
directories.

## If something does not work

- **Node/pnpm version:** check which executables the shell actually uses; open a new terminal after switching the version manager.
- **`web/.env*` file found:** use a clean clone. The preflight does not remove your data.
- **Port in use:** stop the matching test process; do not kill OBS or the production Corneta indiscriminately. The demo uses 1420; Next dev uses 7390. Ingest and callback depend on the configuration/flow shown in the app.
- **Compiler/linker missing:** check C++/MSVC and the Windows SDK, not just the Visual Studio editor.
- **Hash/download error:** do not turn off verification. See [FFmpeg compliance](FFMPEG-COMPLIANCE.md) for the verified mirror, or report the artifact's version/public URL, without credentials.
- **Test fails:** record the command, version/commit and sanitized output. Do not delete the vault, reports or lockfiles as an attempted fix.

The code can be studied and changed without a hosted service. Hosting and distributing a complete fork still requires configuring its own identity, domains, providers and updates; that is not something the demo or a successful local build guarantees automatically.
