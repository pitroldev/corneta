# Auto-update

The official desktop app uses Tauri's updater plugin and an HTTPS manifest published on GitHub Releases. The integration is already part of the app; contributing does not require installing plugins again or generating official keys.

## Behavior in the app

- The automatic check is scheduled after boot; it can also be requested on the About screen. The interval is in [updater.ts](../src/lib/updater.ts).
- An available version shows up in the [update banner](../src/components/UpdateBanner.tsx). The user decides when to install and can dismiss the notice for the session.
- Updating and starting a stream are mutually exclusive in the native backend, under the same engine lock. Installing is not possible while a stream is starting or active, in an error state, or while processes are still finishing the recording. Conversely, starting a stream is blocked from the moment the download starts until the restart, including through a shortcut or after reloading the interface. A failure releases the lock so you can try again.
- The interface disables the incompatible action and explains why. Installing restarts the app; it is never an automatic action during a stream. The lock does not keep the mutex held during download or installation.
- Download and installation show progress, or an indeterminate state when the size is unknown. The signature is validated before installation; a failure does not authorize accepting another file.
- The browser demo and the Contributor profile do not use the official updater. A `null` result from the check can also mean unavailability; it does not prove that the server was queried successfully.

## Files that define the contract

| File                                                                                            | Responsibility                                                                |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [tauri.conf.json](../src-tauri/tauri.conf.json)                                                 | Public key, endpoint, `createUpdaterArtifacts` and Windows install mode       |
| [lib.rs](../src-tauri/src/lib.rs) and [main capability](../src-tauri/capabilities/default.json) | Plugin registration and permissions; Contributor isolation                    |
| [updater.ts](../src/lib/updater.ts)                                                             | Check, shared state, progress and the call to the native installer            |
| [updater.rs](../src-tauri/src/updater.rs) and [commands.rs](../src-tauri/src/commands.rs)       | Mutual exclusion with stream start, signed download, installation and restart |
| [release.yml](../.github/workflows/release.yml)                                                 | Single build, signing, draft and promotion after approval                     |
| [promote-release.mjs](../scripts/promote-release.mjs)                                           | Verification of the approved files and publishing without regressing Latest   |
| [create-updater-manifest.mjs](../scripts/create-updater-manifest.mjs)                           | Generation of `latest.json` from the installer and its signature              |
| [verify-updater.rs](../src-tauri/examples/verify-updater.rs)                                    | Cryptographic verification of the artifact with the public key                |

## Maintainer setup

The interface only has permission for the plugin's check. The native install command accepts the identifier of the resource returned by that check, not an arbitrary URL; only the main window can invoke it. Do not reintroduce direct download, install or restart permissions in the capability: they would bypass the engine lock. The download timeout is in `updater.rs`.

Keep the private key that matches the embedded public key in secure storage and keep a tested backup. Configure `TAURI_SIGNING_PRIVATE_KEY` and, when applicable, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in the release Environment. These values do not belong in the repository, the website or contributor builds.

Losing or replacing the key can prevent existing installations from updating. Do not generate another key pair as a routine build step and do not swap the key to fix Authenticode failures. The [updater signature, Authenticode and SHA-256](SIGNING.md) serve different purposes; a Windows certificate does not guarantee the absence of a SmartScreen warning.

To distribute a fork, use your own identity, repository/endpoint and key pair **before** distributing installations. Do not point the fork at the official releases or infrastructure. The [configuration](CONFIGURATION.md) describes this separation.

## Manifest and release routine

The official endpoint is in `plugins.updater.endpoints`. It points to the `latest.json` of a public release; the desktop app must be able to download the manifest and the installer without the maintainer's authentication.

The versioned generator produces the `platforms.windows-x86_64` entry, with the installer's HTTPS URL and the **contents** of the `.exe.sig` signature, not its path. Version, tag and binary must match. Do not keep a hand-edited manifest alongside the generator.

Pushing a `vX.Y.Z` tag triggers the workflow, which delivers the installer, signature, manifest, checksums and third-party package. After the [gates](RELEASE-GATES.md) and the approval of the `production-release` Environment, the promotion job verifies the same files and publishes automatically. Older versions do not replace Latest; there is no need to edit the endpoint for each version. While the repository is private or the release is a draft, the current channel does not serve installations without a login.

## Diagnosis and recovery

| Symptom                 | What to check                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| No update found         | Installed/candidate version, public availability of the endpoint and network; `null` does not distinguish every cause |
| Manifest not found      | The `latest.json` name, the correct public release and the configured URL                                             |
| Invalid signature       | Same installer and `.sig`, expected public key and the verifier result; never ignore the failure                      |
| Install disabled        | Engine stopped and recording finished; do not force a restart during a stream                                         |
| Stream start blocked    | Update in progress; wait for the restart or an error before trying again                                              |
| Failure after an update | Sanitized logs, data compatibility and reproduction in a VM with a backup                                             |

Test N-1 → N, a tampered signature and unavailability in a disposable environment. Downgrades are not guaranteed: migrated data may not be understood by the previous version. Do not edit the real profile or delete the vault as a repair attempt. See [compatibility](COMPATIBILITY.md) and [support](../SUPPORT.md).
