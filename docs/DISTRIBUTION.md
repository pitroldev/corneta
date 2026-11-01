# Release distribution

GitHub Releases is the source of truth for stable Windows releases. Distribution
reuses the published NSIS bytes; it does not rebuild the desktop installer.
The Microsoft Store edition requires its separate MSIX build.

## Channels

| Channel                               | Update mechanism                                                    | Required setup                                                         |
| ------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| GitHub                                | Existing Release workflow, including its production approval gates  | Existing signing and release configuration                             |
| SourceForge                           | GitHub Releases integration already configured in SourceForge       | Keep the existing webhook active                                       |
| Scoop                                 | Scheduled workflow in pitroldev/scoop-corneta, every six hours      | No persistent credential; repository-scoped GITHUB_TOKEN               |
| Chocolatey                            | Scheduled workflow in pitroldev/chocolatey-corneta, every six hours | CHOCOLATEY_API_KEY secret in that repository                           |
| itch.io                               | Distribute release workflow, after Release succeeds                 | BUTLER_API_KEY secret in pitroldev/corneta                             |
| Microsoft Store                       | Separate MSIX build and submission after Release succeeds           | Four Partner Center API secrets in pitroldev/corneta                   |
| Uptodown                              | Editors may retrieve releases from official sources                 | Keep editor uploads enabled; publication remains editorial             |
| MajorGeeks / FossHub                  | Initial listing requests remain subject to approval                 | Confirm the update interface after acceptance                          |
| AlternativeTo / Uneed / curated lists | Product links and descriptions                                      | Update meaningful product information; no installer upload per version |

The root workflow uses workflow_run because releases published with GITHUB_TOKEN
do not trigger another release workflow. It always resolves the latest published
stable release, including on a retry. It never redistributes drafts or prereleases.
Package repositories poll independently, avoiding a persistent cross-repository
write token. Their verifier checkout is pinned to a reviewed Corneta commit.

## Credentials and activation

Secrets must be stored through GitHub Actions settings or gh secret set using
standard input. Never place values in repository files, command history, PRs,
screenshots, or workflow logs. Creating credentials or authorizing a new service
connection is a separate account setup step.

- Chocolatey: store the existing account publishing key as CHOCOLATEY_API_KEY in
  pitroldev/chocolatey-corneta. New packages remain subject to moderation.
- itch.io: authorize butler and store its wharf API key as BUTLER_API_KEY in
  pitroldev/corneta. The destination is pitroldev/corneta:windows-installer.
  On the first actual publication to this channel, hide the original manually
  uploaded installer so the page does not offer both the old and current build.
- Microsoft Store: associate an Entra application with Partner Center and grant
  the required publishing role. Add AZURE_AD_TENANT_ID,
  AZURE_AD_APPLICATION_CLIENT_ID, AZURE_AD_APPLICATION_SECRET, and SELLER_ID.
  The fixed Store product is 9P1Q28Q6Q6TD. Do not substitute unrelated tenant
  credentials. Microsoft Store 0.13.1 was already published manually; automated
  MSIX builds start with subsequent stable tags containing the Store build profile.

Missing credentials fail only the affected publishing job with an actionable
message. A successful build or uploaded workflow artifact is not a Store
submission, and a submitted package is not yet a certified/public package.

## Verification and retries

Before redistribution, scripts/distribution.mjs checks:

- Published stable release identity, main ancestry, exact asset names and URLs.
- GitHub asset digests and SHA256SUMS.txt for all four payload files.
- Matching updater version, installer URL and signature metadata.
- The installer's cryptographic signature using the same Rust verifier and
  public key used by the application release process.
- The release and tag remain unchanged immediately before publication.

Package updates reject downgrades and different bytes for an existing version.
Chocolatey checks the public package feed, including submitted versions, before
uploading, so a retry after a successful upload does not submit it twice.
Its install/reinstall/uninstall validation runs only on disposable GitHub-hosted
Windows runners with synthetic data, and never starts Corneta.

The Store job builds from the exact released commit, checks the package report,
commit, version, clean worktree and final SHA-256, then submits the MSIX. The
existing telemetry-disabled Store profile, package identity and third-party
compliance checks are retained. Certification is performed by Microsoft.

Use the workflow_dispatch form with publish=false for preparation and validation;
this is the default. No external upload or package-repository commit occurs.
For an actual retry, select the affected channel and publish=true from main.
Inspect Partner Center before retrying a Store submission that may have reached
Microsoft: an existing draft or pending certification may require attention.
Do not publish artifacts to validate a change.

SourceForge and editorial directories may update later than GitHub. Check the
individual destination before announcing availability everywhere.

## Maintainer checks

In a disposable checkout without real environment files or application data:

```powershell
pnpm install --frozen-lockfile
pnpm contrib:check
pnpm source:check
cargo test --locked --manifest-path scripts/distribution-verify/Cargo.toml --target-dir .artifacts/distribution-verifier
node scripts/distribution.mjs prepare .artifacts/distribution-check
```

The last command downloads and verifies the existing release; it does not
install Corneta, mutate a store or publish anything. Keep failed channel details
in Actions summaries and logs; never infer success from another channel.

## Provider references

- [GitHub workflow event triggering](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow)
- [itch.io butler authentication](https://itch.io/docs/butler/login.html)
- [itch.io build uploads](https://itch.io/docs/butler/pushing.html)
- [Microsoft Store GitHub Actions](https://learn.microsoft.com/en-us/windows/apps/publish/msstore-dev-cli/github-actions)
- [Chocolatey automatic packages](https://docs.chocolatey.org/en-us/create/automatic-packages/)
- [Uptodown updates](https://support.uptodown.com/hc/en-us/articles/360061457991-How-to-update-an-app-that-you-already-published-on-Uptodown)
