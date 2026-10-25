# Security

## Report vulnerabilities privately

**Do not open a public issue with exploit details, tokens, stream keys, personal data or configuration files.**

Use **Report a vulnerability** in the Security tab of the [official repository](https://github.com/pitroldev/corneta/security/advisories/new). It opens a private report that only the maintainer sees; do not confuse it with creating an issue.

You can also write to **[contact@corneta.live](mailto:contact@corneta.live)** with the subject `Corneta — private security report`. Send a sanitized summary first and agree on a suitable channel before transferring sensitive material. Do not send your stream key, password, OAuth token or `.env`, not even by email.

## What to include

- Affected version and commit; say whether it is an official build, a contributor build or a fork.
- Surface: desktop, setup/OAuth API, website, updater, chat, local files or sidecar.
- Minimal steps and the observed impact, using accounts and data under your control.
- Relevant Windows, OBS and environment details; include times with time zone when useful.
- A minimal, sanitized proof of concept. Do not access third-party data to demonstrate impact.

If one of your credentials leaked, revoke it with the provider and generate a new one. Deleting the message or the file does not make the old credential safe. Keep only the evidence you need and do not publish the compromised value.

## Versions and response

Triage focuses on the main branch and the latest published official version; there is no commitment to backport to old versions or forks. Report problems found in other versions so we can assess their reach.

No SLA, on-call team, bounty program or security certification is promised. Acknowledgment, assessment and disclosure will be coordinated by the maintainer according to availability and severity. If you do not receive an acknowledgment, contact us again without publishing sensitive details as a way to get a response.

## Testing limits

Use an isolated local environment and authorized accounts. Do not run destructive tests, aggressive scans, exfiltration, denial of service or streams to third-party accounts. The code being open source does not authorize attacking the official service or the integrated providers.

For bugs with no security impact or usage questions, follow [CONTRIBUTING.md](CONTRIBUTING.md). Official secrets are not needed for development: the [contributor profile](docs/DEVELOPMENT.md) exists for that.
