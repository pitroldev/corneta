# Microsoft Store MSIX

The Microsoft Store edition uses `pitroldev.Corneta`, publisher
`CN=CA9298D5-25D1-490F-8BFE-5807D0ACE4EC`, and publisher display name `pitroldev`.
The listing credits Petro Cardoso (pitroldev). Package versions append `.0` to
the repository version; Microsoft reserves the final component.

## Build

Use the Windows x64 toolchain and a disposable checkout described in
[CONTRIBUTING.md](../CONTRIBUTING.md), without real `.env` files, accounts,
recordings, or application configuration. Install the Windows SDK packaging tools.

```powershell
pnpm install --frozen-lockfile
pwsh -NoProfile -File scripts/fetch-binaries.ps1
pnpm compliance:prepare
pnpm store:build
```

The command builds the frontend and native executable, verifies sidecar hashes,
scans the payload for secrets, generates icons from the existing app icon, and
packages with MakeAppx semantic validation enabled. It then unpacks the MSIX and
checks every payload hash. Outputs are in `.artifacts/store/`:

- `Corneta_<version>_x64.msix`: unsigned package for Microsoft Store ingestion.
- `package-validation.json`: identity, SHA-256, inventory, build revision, dirty
  state, and packaging checks. This is not a Microsoft certification report.
- `build.json`: executable identity required by `pnpm store:package`.

The build deliberately disables telemetry and strips inherited credentials. The
public Setup API supplies provider configuration, as in the normal release.
The Store edition has its own config directory and credential service. Existing
NSIS installations retain their configuration and updater behavior.

## Runtime differences

Store builds omit the Tauri updater plugin and reject external updater commands.
The About screen identifies Microsoft Store as the update manager. Autostart uses
the manifest startup task, initially disabled, and respects Windows user policy.
The MSVC runtime is statically linked. FFmpeg and MediaMTX remain adjacent to the
executable; mutable configuration remains in the app config directory.

The package targets Windows 10 build 19041 and later, x64 desktop. Like other
Tauri builds, it requires Microsoft Edge WebView2 Runtime. Windows 11 includes
it; verify runtime availability on the Windows 10 test machine.

## Validation and release

Run `pnpm contrib:check`, `pnpm source:check`, native checks from
[DEVELOPMENT.md](DEVELOPMENT.md), and the Windows App Certification Kit on an
isolated Windows test account or VM. Never use a production stream to validate.
Check launch, writable configuration, sidecar execution with synthetic media,
startup opt-in/disable, and uninstall. Store certification and real GPU/service
coverage are separate from MakeAppx validation.

Before packaging, run `pnpm compliance:prepare` to generate the corresponding
source package included inside the MSIX, following [FFMPEG-COMPLIANCE.md](FFMPEG-COMPLIANCE.md).
Retain the existing [RELEASE-GATES.md](RELEASE-GATES.md) requirements. Neither
`store:build` nor `store:package` uploads, signs, installs, or publishes anything.
Microsoft signs the package during Store processing; do not install a test
certificate into a user's trust store just to produce the upload artifact.
