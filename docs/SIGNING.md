# Signing and trust in the distribution

The distribution policy allows an installer without Authenticode, with an explicit warning.
The updater's cryptographic signature is mandatory and independent of the Windows certificate.

| Protection        | What it proves                                             | Current policy                                                                                          |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Updater signature | The installer matches the public key embedded in the app   | Mandatory; verified cryptographically before the release is generated                                   |
| Authenticode      | Publisher identity and integrity of the Windows executable | Optional while `REQUIRE_WINDOWS_CODE_SIGNING` does not require it; an existing invalid signature blocks |
| SHA-256           | The downloaded file has the published bytes                | Generated in SHA256SUMS.txt; does not replace a signature                                               |
| Build provenance  | The file came out of this repository's Release workflow    | GitHub attestation for every release file, plus an SPDX SBOM of the source dependencies                 |

## SmartScreen: no false promises

An unsigned installer may show "unrecognized app". Whether the warning appears and what it
looks like depend on reputation and Windows policies; it is not correct to promise that everyone
will see the same screen. OV and EV certificates do not guarantee the absence of warnings either. EV no longer
gets an automatic reputation bypass, according to the
[Microsoft documentation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

Before downloading, users should find the official domain/repository, the explanation about
the certificate and the SHA-256. Do not tell people to disable their antivirus or ignore malware detections.
An antivirus scan without detections is not a guarantee of safety.

## Verify the installer

```powershell
pwsh -NoProfile -File scripts/check-windows-signature.ps1 -InstallerPath PATH_TO_INSTALLER.exe
```

The workflow runs this check on the artifact that will be attached. By default it accepts
`NotSigned` with a warning, or `Valid`. Any other state blocks.

Once there is a certificate, configure Tauri's signing mechanism and the
Environment variable `REQUIRE_WINDOWS_CODE_SIGNING=1`. The same script accepts `-RequireSigned` locally.
Do not replace the updater key to solve an Authenticode problem.

Configuration supported by Tauri: `bundle.windows.certificateThumbprint`,
`digestAlgorithm`, `timestampUrl`, or a `signCommand` that integrates the chosen service.
See the [official Windows signing documentation](https://v2.tauri.app/distribute/sign/windows/)
when choosing a vendor, and confirm eligibility, pricing and key protection at that time.
Do not store the certificate, private key or password in the repository.

## Verify where a release was built

Releases published after 0.13.1 carry GitHub attestations: build provenance for the
installer, its updater signature, `latest.json`, `SHA256SUMS.txt` and
`corneta-third-party.zip`, and an SPDX SBOM of the source dependencies attached to
the installer. With the [GitHub CLI](https://cli.github.com/):

```sh
gh attestation verify Corneta_X.Y.Z_x64-setup.exe --repo pitroldev/corneta
gh attestation verify Corneta_X.Y.Z_x64-setup.exe --repo pitroldev/corneta \
  --predicate-type https://spdx.dev/Document/v2.3 --format json
```

A valid attestation proves the bytes were produced by the Release workflow of this
repository, at the commit it names. It does not prove the publisher's identity the
way Authenticode does, and it does not prove the software is safe. The SBOM lists the
dependencies declared in the lockfiles at that commit; the bundled sidecars are
described in `corneta-third-party.zip`.

## Code signing policy

The Windows installer is not Authenticode-signed yet. The project is applying for
free open source code signing through the [SignPath Foundation](https://signpath.org/);
this section will name the signing service and the certificate holder once a
certificate is issued.

- **Builds:** every release is built by the [Release workflow](../.github/workflows/release.yml)
  from a version tag on `main`, after CI passes. Binaries built on a personal
  computer are never published.
- **Third-party binaries:** FFmpeg and MediaMTX ship as their upstream builds,
  pinned by SHA-256 and described in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
  The project does not sign them as its own.
- **Committers and reviewers:** [@pitroldev](https://github.com/pitroldev). Changes
  from other contributors arrive through pull requests that pass CI and a review.
- **Approvers:** [@pitroldev](https://github.com/pitroldev) approves each release
  in the `production-telemetry` and `production-release` environments before it is
  built and published.
- **Privacy:** Corneta connects to the platforms and services the user sets up.
  Usage data is only sent after the user turns it on, and error reports can be
  turned off in Settings. The installer links to the
  [privacy policy](https://www.corneta.live/en/legal/privacy), which lists what is
  collected and where it goes.

## Check before distributing

- Publish the warning in the real download flow and check the downloaded installer, not just the local file.
- Test installation on a clean Windows machine with normal security policies.
- Confirm a secure backup of the updater key and rehearse N-1 → N.
- When adopting Authenticode, require a valid signature in the gate, without treating buying EV as a guaranteed solution.

See [AUTO-UPDATE.md](./AUTO-UPDATE.md) and
[RELEASE-GATES.md](./RELEASE-GATES.md).
