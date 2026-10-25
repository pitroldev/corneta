# Release gates

Approval criteria for an official distribution, for maintainers. A release may only be published when it meets every criterion below. Keep the results and evidence with the release run; this document does not certify any specific artifact.

## Automated

- The release artifact job depends on the reusable run of the `CI` workflow; every job receives
  the same exact tag ref, including on `workflow_dispatch`, and the artifact does not start if
  any quality job fails.
- Green CI: frontend lint, tests and build.
- `cargo fmt`, strict Clippy, tests and `cargo deny` green. `cargo deny` reads the same advisory
  database as `cargo audit`, limited to the Windows graph.
- `cargo deny` ignores are restricted to informational advisories with no fix available and
  require a justification in `deny.toml`; vulnerabilities cannot be ignored.
- Ignored media integration tests run with real FFmpeg/FFprobe, in the same `rust` job,
  reusing the build from the other tests.
- Sidecars are downloaded by the versioned script and their SHA-256 is checked.
- The Rust job prepares its own sidecars. The script tries `CORNETA_FFMPEG_MIRROR_URL` (when
  set), the repository's mirror prerelease and upstream, always with the same pinned hash.
  Upstream removes daily builds after about two weeks: the mirror prerelease with the ZIP and the
  source package is mandatory for every pinned build.
- Production Next requires `web:release:check` (automatic on Vercel production): consistent
  OAuth/proxy configuration, HTTPS download and identity/telemetry. The local limiter does not
  require remote storage; the gate does not check WAF/edge rules on the host.
- The Vite shell step uploads the source maps to the correct project and deletes them; it is the
  only step that receives `POSTHOG_API_KEY` and `POSTHOG_PROJECT_ID`. The gate, Rust build,
  scanner and upload do not receive the Personal API Key. Before the build, an authenticated GET
  without redirects confirms on PostHog US that the ID exists and that its `api_token` is exactly
  the embedded public project token; a network/auth/schema error or a mismatch blocks without
  printing the response or the credential.
- PostHog CLI 0.9.4 is downloaded in a step without secrets, checked against the SHA-256 pinned
  in the repository and passed to Vite by explicit path; a failed download, integrity check or
  extraction, or a different version, blocks the build.
- Processing covers the worker and its imports, in addition to the main chunks. Invalid pairs
  or incomplete processing block the build; `pnpm bundle:check` checks the frontend before the
  native compilation, without replacing the final installer inspection.
- A single Tauri CLI run with Rust 1.97.1 produces the executable, the NSIS installer and the updater signature.
  The tag must be exactly `v` + the Tauri version, and `create-updater-manifest.mjs` generates the
  v2 `latest.json` from the contents of the `.exe.sig` and the URL of that same installer.
- The Rust example `verify-updater` cryptographically verifies the installer with the app's
  public key in 64 KiB blocks. An invalid signature blocks manifest generation.
- `compliance:prepare` requires reviewed corresponding sources and hashes; it generates a package
  with notices, sources and inventories. `SHA256SUMS.txt` accompanies the other four distribution files.
- Before any release artifact upload, `pnpm artifacts:check` requires 7-Zip, lists and extracts the NSIS installer and confirms
  that `.map`, `phx_`, minisign/PEM keys and other secrets do not appear in `dist`, the binary,
  the bundle tree or the extracted content. The scan covers the content that 7-Zip can
  interpret; it is not proof about compressed bytes in an opaque format that 7-Zip cannot open.
- Only after that scan does the workflow use `gh release create/upload` to create or update a
  draft. An existing draft is rejected if it contains any asset other than the exact approved basenames of the
  `.exe`, `.exe.sig`, `latest.json`, `SHA256SUMS.txt` and `corneta-third-party.zip`; no release action receives the
  signing/telemetry secrets.
- After the rehearsals and the `production-release` approval, the `publish` job validates that
  Environment's protection, the remote tag, the five files preserved by the run's artifact ID,
  their hashes and their match with the remote assets. Only then does it promote the draft; it
  does not rebuild or overwrite public assets. Promotions are serialized and older versions do
  not replace Latest. A missing reviewer, an enabled bypass or inaccessible metadata blocks it.
- The release job requires a `## [X.Y.Z] - YYYY-MM-DD` section for the tagged version in
  [CHANGELOG.md](../CHANGELOG.md). Move the `Unreleased` entries there before tagging; the
  release notes repeat them in English first, then in Portuguese.
- Before promoting, the `publish` job attests the build provenance of the five files and attaches
  an SPDX SBOM of the source dependencies to the installer, both through GitHub attestations; the
  release keeps exactly five assets. See [how to verify a release](SIGNING.md#verify-where-a-release-was-built).
- The `telemetry:release:check` gate confirms the US region and the same public project token in
  the desktop app, site and Setup API, smoke-tests the published metadata without exposing the
  Personal API Key and requires an identical SHA across React/Rust/Next.js and the published
  version of the telemetry notice.
- The gate waits up to ten minutes for the tag's deployment during the build; promotion
  rechecks the deployment against the approved configuration to avoid acting on a stale approval.
- The repository Actions variable `TELEMETRY_DISABLED` feeds the same value to the Vite and Rust
  switches. Emergency mode is only valid with both at `1` and receives no source map credentials;
  any mismatch blocks the release.

## Manual and external

- WAF/edge configured and verified for both Kick OAuth POST routes, covering hosts,
  aliases and normalized paths, with no direct access to the origin and no interactive browser
  challenge. Validate the `429` block before running multiple instances and record the provider's
  actual regional scope; the local cache does not impose a global limit.
- Authenticode follows the [signing policy](SIGNING.md). The gate accepts
  `NotSigned` with a warning or `Valid`, never an invalid signature. `REQUIRE_WINDOWS_CODE_SIGNING=1`
  requires a signature once signing is adopted. Check the warning on a clean Windows install; a
  signature does not guarantee that SmartScreen will not appear.
- Test N-1 → N against a test HTTPS endpoint, and recovery with a compatible snapshot/backup.
  A private draft is not a public endpoint; do not assume automatic downgrade.
- FFmpeg GPL compliance package attached to the distribution as described in
  `THIRD_PARTY_NOTICES.md`.
- Approved real-world matrix: Windows 10 and 11; NVIDIA, Intel, AMD and software; OBS with
  authentication and without a password; Twitch/YouTube/Kick and one custom RTMP; network drop,
  OBS crash, suspend and resume; clean install and an upgrade that preserves the configuration.
- Real credentials must come from test accounts with no personal data. Never attach `.env`,
  keys, tokens, raw logs or certificates to the issue/artifact.
- The GitHub Environment `production-telemetry` has a required reviewer; DPA/MFA, IP discarding,
  90-day retention and the PT/EN telemetry notice version `2026-09-09` must be in place before
  approval.
- `production-release` has a required reviewer for the draft rehearsals. Both Environments
  refuse administrator bypass and only accept `v*` tags. The repository/channel must serve the
  manifest and installer without maintainer authentication. Check the host requirements
  with `pnpm release:readiness`; the command does not replace the gates of a real artifact.
- Record the legal review of the balancing test and of the PT/EN texts before enabling production
  collection. Desktop usage data is opt-in and crash reports are opt-out; preserving old explicit
  choices does not prove valid consent. An automated test, a notice or publishing the code does
  not prove that the legal basis is adequate or that retention/discarding is configured at the
  processor.
- On a clean install, confirm usage **off** and crash reports **on** before any choice is made.
  There must be no usage event in that state; crash reports and the minimal launch marker
  may be sent. With both off, confirm zero new requests to PostHog. Enabling usage must only
  allow future events, without recovering the earlier onboarding. Preserve explicit `enabled`
  and `disabled` choices across notice upgrades; closing the notice or accepting the terms must
  not enable usage. Then turn on one purpose at a time,
  inspect payloads and validate a symbolicated React stack.

Record date, version, machine, GPU/driver, scenario and result on every run. A failure in any
item blocks publication; it must not be turned into an “accepted risk” without an explicit decision.
