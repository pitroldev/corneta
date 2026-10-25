# Repository security

Procedures for reviewing the publishable code and the repository controls.
This guide does not prove the current state of GitHub, does not certify the
application and does not approve a distribution. The publication criteria are in
the [release gates](RELEASE-GATES.md).

## Scanning history and publishable files

Use the Node version pinned by the project, Git and `tar`, on Windows or Linux x64:

```sh
git fetch --all --tags
node --test scripts/audit-secrets.check.mjs
node scripts/audit-secrets.mjs
```

The [scanner](../scripts/audit-secrets.mjs) downloads Gitleaks 8.30.1 from the
official release, checks the pinned SHA-256, refuses shallow clones and scans all
local refs with `--all --full-history`. In a shallow clone, fetch the full history
before the scan. The snapshot includes tracked files and new non-ignored files;
ignored private files are left out. The process does not load dotenv as
configuration, uses no provider credentials and does not publish results.

Read the sanitized summary in `.artifacts/secret-audit/summary.json`: it
identifies HEAD, refs, inventory, configuration and findings without reproducing
values, code excerpts, authors or e-mail addresses. Keep the local reports ignored
and do not attach raw output to issues. Run the scan again after the last changes,
the final commit and the refs update; an earlier result does not validate new
bytes.

The scan does not cover remote attachments, OCR of images or credential validity.
Also review the text, comments and attachments of PRs/issues that will be
exposed, without sending private data to external services. Follow the
[public assets](PUBLIC-ASSETS.md) procedure for images.

### Fixture exceptions

The exceptions in [`.gitleaks.toml`](../.gitleaks.toml) are restricted to
synthetic entries from the redaction tests:

| Rule              | File                               | Allowed entry                                                              |
| ----------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| `jwt`             | `src/lib/telemetry-schema.test.ts` | JWT with a fake signature, at the exact value pinned by the configuration. |
| `generic-api-key` | `web/lib/telemetry-schema.test.ts` | Numeric PostHog transport placeholder, at the exact pinned value.          |
| `generic-api-key` | `src-tauri/src/telemetry.rs`       | Invalid JWT used by the Rust redactor test, at the exact pinned value.     |

Each exception requires the rule, an anchored path and the exact value, all at
once. Do not ignore whole files, commits or generic token prefixes. The
`audit-secrets.check.mjs` test checks the allowed fixtures and requires findings
when their values or paths change. Do not widen the configuration just to get a
green scan.

If a real credential turns up, stop the publication, revoke/rotate it first
and coordinate the history cleanup. Do not publish its value or try to validate it
against a provider. See [GitHub's procedure for removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

## Controls to check on GitHub

Review the controls on the repository and branch that will be published. Their
state depends on permissions, plan and visibility; a missing field or an error
response does not prove that a control is active.

- The `Proteger main` ruleset blocks deletion and force pushes on the default
  branch, including for administrators.
- The same ruleset requires a pull request with one approval, an up-to-date branch
  and the `resolve`, `secrets`, `frontend` and `rust` checks from
  [CI](../.github/workflows/ci.yml), bound to GitHub Actions. The `frontend` job
  requires `browser-smoke` to succeed; a skipped job must not be treated as
  approval. Repository administrators may bypass the pull request and checks to
  push directly, and stay responsible for running the checks before they do.
- In the Vercel project, Deployment Checks hold each production deployment until
  the same four checks pass, so a red commit on `main` never reaches the site.
- Check the actual names in a run before changing the protection. Renaming
  jobs requires updating the required checks and the Vercel Deployment Checks at
  the same time; do not impose reviewers the project does not have.
- Keep the default Actions token read-only and without permission to approve PRs.
  Review the approval of runs from forks and avoid giving secrets to untrusted
  code.
- Check the availability and activation of secret scanning and push protection.
  The local/CI scanner is not equivalent to these GitHub controls.
- [CodeQL](../.github/workflows/codeql.yml) analyzes the workflows, JavaScript/TypeScript
  and Rust on every pull request, every push to `main` and weekly;
  [OpenSSF Scorecard](../.github/workflows/scorecard.yml) publishes the repository's
  supply-chain score. Triage their findings in the Security tab; neither replaces review.
- Confirm that the private channel in [SECURITY.md](../SECURITY.md) receives
  reports, without using secrets as a test. Do not advertise native private
  reporting as usable without verifying that it is enabled and reachable.

### Queries without external changes

```sh
gh api repos/pitroldev/corneta --jq '{visibility,default_branch,security_and_analysis}'
gh api repos/pitroldev/corneta/rules/branches/main --jq '[.[] | {type, parameters}]'
gh api repos/pitroldev/corneta/actions/permissions/workflow
gh api repos/pitroldev/corneta/private-vulnerability-reporting
gh api repos/pitroldev/corneta/actions/permissions/fork-pr-contributor-approval
```

In forks, replace the owner, repository and branch with your own. Record only
the fields you need, together with the verified SHA/context; do not publish
tokens, collaborator data or raw responses containing private information.

To enable native private reporting, the authorized maintainer can run:

```sh
gh api --method PUT repos/pitroldev/corneta/private-vulnerability-reporting
gh api repos/pitroldev/corneta/private-vulnerability-reporting
```

Confirm `enabled: true` in the query. If the feature is not available, record
the limitation and keep a private channel that has actually been tested. Also
review Settings → Actions → General and Settings → Code security, especially when
changing the visibility. No command in this guide authorizes publishing the
repository, granting access or automatically creating external test reports.

References: [Gitleaks release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1),
[branch protection](https://docs.github.com/en/rest/branches/branch-protection) and
[private reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).
