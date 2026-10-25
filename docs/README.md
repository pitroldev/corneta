# Corneta documentation

Start with the [project README](../README.md) to learn about the app, its requirements and the demo. This index gathers the guides and contracts maintained alongside the code.

## Use and test

- [Help and guides](../web/content/): usage content published by the website; [support](../SUPPORT.md) explains how to report a problem safely.
- [Development](DEVELOPMENT.md): run the demo, the website and the desktop app in an isolated contributor profile.
- [Compatibility](COMPATIBILITY.md): supported platforms, versions and data formats.
- [Synthetic reports](SYNTHETIC-REPORTS.md): generate, test and restore scenarios without using personal reports.

## Contribute

- [Contributing](../CONTRIBUTING.md): setup, tests and criteria for a PR.
- [Architecture](ARCHITECTURE.md): responsibilities, modules and lifecycle contracts.
- [Configuration](CONFIGURATION.md): variables, precedence and the separation between the official distribution, Contributor and forks.
- [Network surface](NETWORK-SURFACE.md): processes, ports, OAuth and integrations.
- [Performance](PERFORMANCE.md): limits, benchmarks and measurements that need real hardware.
- [Voice and tone](VOICE-AND-TONE.md): app language, translation and error messages.
- [Editorial content](../web/content/README.md) and [editorial maintenance](EDITORIAL-MAINTENANCE.md): write, review and publish help and guides.
- [Repository security](REPOSITORY-SECURITY.md): check for secrets and review fixture exceptions. Vulnerabilities go through the [private channel](../SECURITY.md).
- [Conduct](../CODE_OF_CONDUCT.md): expectations for collaboration.

## Operate and distribute

- [Release gates](RELEASE-GATES.md): approval criteria; running a subset does not approve the release.
- [Signing](SIGNING.md) and [auto-update](AUTO-UPDATE.md): installer integrity, updater and recovery.
- [FFmpeg compliance](FFMPEG-COMPLIANCE.md) and [third-party notices](../THIRD_PARTY_NOTICES.md): licenses and corresponding sources for the distribution.
- [Public assets](PUBLIC-ASSETS.md): provenance, inventory and review of assets.
- [Privacy policy](https://www.corneta.live/legal/privacy): what telemetry collects and how to turn it off; variables and kill switches are in the [configuration](CONFIGURATION.md).

## Maintain the documentation

Update the guide that owns the contract you changed. Shipped changes appear in the [notes for each release](https://github.com/pitroldev/corneta/releases); preparing and operating the official distribution is up to the maintainers, outside the repository. Plans, future priorities, execution logs and review reports must not become permanent documentation pages.

`pnpm docs:check` checks local destinations in tracked and new Markdown files, including images and references, ignoring examples in code and comments. The command does not query external URLs or validate anchors; check those cases when reviewing links.
