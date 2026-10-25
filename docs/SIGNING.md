# Signing and trust in the distribution

The distribution policy allows an installer without Authenticode, with an explicit warning.
The updater's cryptographic signature is mandatory and independent of the Windows certificate.

| Protection        | What it proves                                             | Current policy                                                                                          |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Updater signature | The installer matches the public key embedded in the app   | Mandatory; verified cryptographically before the release is generated                                   |
| Authenticode      | Publisher identity and integrity of the Windows executable | Optional while `REQUIRE_WINDOWS_CODE_SIGNING` does not require it; an existing invalid signature blocks |
| SHA-256           | The downloaded file has the published bytes                | Generated in SHA256SUMS.txt; does not replace a signature                                               |

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

## Check before distributing

- Publish the warning in the real download flow and check the downloaded installer, not just the local file.
- Test installation on a clean Windows machine with normal security policies.
- Confirm a secure backup of the updater key and rehearse N-1 → N.
- When adopting Authenticode, require a valid signature in the gate, without treating buying EV as a guaranteed solution.

See [AUTO-UPDATE.md](./AUTO-UPDATE.md) and
[RELEASE-GATES.md](./RELEASE-GATES.md).
