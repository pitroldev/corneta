# How to contribute to Corneta

Small contributions, documentation fixes and reproducible reports are welcome. Issues and discussions can be written in English or Portuguese; **code, comments, tests and documentation are always in English**. Contributions are reviewed as maintainers have time, with no promised turnaround or ongoing support.

## First step

Follow the [README](README.md) and the [development guide](docs/DEVELOPMENT.md). For UI and report logic, start with the demo; you don't need to install OBS/Rust or ask the maintainer for credentials.

```sh
pnpm install --frozen-lockfile
pnpm contrib:demo
```

Before the PR:

```sh
pnpm contrib:check
```

Use a clean clone for this validation. Do not copy your `.env`, vault, personal settings, report database or updater key into the test project. Do not test the contribution during your production stream.

## Language and code comments

Use English for identifiers, comments, docstrings, test descriptions, assertion messages, logs and tool diagnostics. Interface text stays in the corresponding translations; multilingual test inputs, proper names and integration or persistence contracts must not be changed just to translate their spelling.

Keep comments short and only to explain a non-obvious constraint, a risk, a compatibility decision or the reason for an implementation. Remove code narration, decorative separators, change history and repeated names or types. Architecture, tutorials and usage instructions belong in the documentation. Preserve license notices, tool directives, security justifications and useful public API contracts. These rules are also in [AGENTS.md](AGENTS.md).

`pnpm source:check` checks known patterns of technical Portuguese and decorative comments in JS/TS, Rust, CSS and HTML, without running the sources. The same JS/TS rule is part of the app's and the site's ESLint; the full check also runs in CI through `scripts:check`. Localized text and fixtures are not treated as technical prose. Detection is heuristic: it does not prove that all text is in English or that every comment is useful; comments, uncovered formats and messages passed between functions still need human review. Logs must use English diagnostics or stable codes, kept separate from the translation shown to the user; do not change external messages from the operating system or providers just to change their language.

## Pick a well-scoped change

For a bug, describe the expected result, the observed result and minimal steps. For a large feature, discuss it in an issue first: a finished implementation does not guarantee the change will be accepted. Keep refactoring, file normalization and behavior changes in separate PRs when possible.

Include version/commit, Windows, OBS, GPU/driver and streaming mode when they are relevant. Use made-up data or minimal sanitized examples; do not attach personal logs/NDJSON/videos indiscriminately. A suspected vulnerability goes to the [private channel](SECURITY.md), not to a public issue.

## Where to work

| Area                              | Code                                                         | Main validation                                             |
| --------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| UI and design system              | `src/components/`, `src/screens/`                            | lint, types, tests and demo                                 |
| Reports and replay chat           | `src/screens/reports/`, `src/lib/report*`, `src/lib/replay*` | fixtures, clock/pagination tests and the reports smoke test |
| Processing and native integration | `src-tauri/src/`                                             | rustfmt, Clippy, Rust tests; real-world tests when needed   |
| Website and API                   | `web/app/`, `web/lib/`                                       | lint/types, build and route/contract tests                  |
| Help content                      | `web/content/`                                               | [editorial protocol](web/content/README.md)                 |
| Distribution                      | `scripts/`, `.github/workflows/`, `compliance/`              | script and gate tests; do not publish to test a PR          |

JS/TS tests are picked up by the root Vitest, including the relevant tests in `web/`. For a focused loop, `pnpm exec vitest run PATH_TO_TEST` can save time; it does not replace the integrated validation before you submit.

For Rust, prepare the sidecars and run inside `src-tauri/`:

```sh
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --all-targets
```

These commands may read the workspace's public build configuration; run them in the clean contribution clone, without reusing an official `.env`. For the `ignored` media tests, follow the [setup and execution of the native integration tests](docs/DEVELOPMENT.md#native-integration-tests). Do not report that they were run if you only ran unit tests.

## Invariants a contribution must preserve

- **Streaming comes before auxiliary tasks.** Reports, chat, recording and diagnostics must not block the sending path for convenience. Preserve cancellation, bounded queues and process cleanup.
- **Secrets stay out of the frontend and public artifacts.** `VITE_`/`NEXT_PUBLIC_` prefixes are public; do not use them for secrets. PKCE, callback validation, the vault and redactors must not be relaxed to make a test pass.
- **A failure must stay isolated.** Handle cancellation, a disconnected destination, a missing file, an invalid response and shutdown in the appropriate subsystem.
- **Performance is part of behavior.** Preserve lazy loading, workers, virtualization and retention limits. Measure before/after changes to hot paths; do not claim a gain based only on fewer lines of code.
- **Consistent interface.** Use the design system components, including `Select`, and keep keyboard navigation working. Update Portuguese and English when you introduce public text.
- **Local data belongs to the user.** Format changes need compatibility/migration and tests; do not reset settings, the vault or reports to fix a problem.
- **Official gates stay closed.** A local profile does not authorize publishing without the updater signature, the corresponding sources and the other checks.

## What the PR should include

Explain the problem, the chosen solution and what was left out of scope. List the commands you actually ran and their results, including checks you did not run. Add a regression test for bugs and sanitized visual evidence if you change the interface. For performance changes, describe the scenario, data volume, hardware and measurement. If people using Corneta will notice the change, add a line under `Unreleased` in [CHANGELOG.md](CHANGELOG.md).

Pull requests to `main` need the CI checks to pass and a review from the maintainer before they are merged.

You must have the right to contribute the code and materials you submit, preserving authorship and third-party notices. The project's own code is under the [MIT](LICENSE) license; do not introduce content under an incompatible license or private data. Assistive tools do not exempt you from review, testing and provenance checks.

Be respectful, discuss technical decisions with evidence and avoid personal attacks. The maintainer may ask for changes or decline a change for reasons of scope, security, maintenance or product priority.

See also [conduct](CODE_OF_CONDUCT.md), [support](SUPPORT.md), [architecture](docs/ARCHITECTURE.md) and [performance](docs/PERFORMANCE.md). CODEOWNERS identifies who is responsible for review, but does not replace PR approval.
