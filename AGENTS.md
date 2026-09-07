# Source language and comments

- Use English for source identifiers, comments, docstrings, test descriptions, assertion diagnostics, logs, build output, and developer-facing errors.
- Keep localized interface copy in its existing translation/content layer. Preserve multilingual test inputs, protocol values, stored data, and proper product names; these are not developer prose. Do not change a public or persisted contract just to translate its spelling.
- Keep a comment only when it explains a non-obvious constraint, safety requirement, compatibility decision, or reason the implementation must work this way. Keep it short and next to the relevant code.
- Remove comments that narrate statements, repeat names/types, decorate sections, describe old implementations, or teach general concepts. Put architecture, setup instructions, workflows, and product explanations in maintained documentation instead of source comments. Do not create historical cleanup reports.
- Preserve license notices, compiler/linter directives, `SAFETY` explanations, and useful public API contracts. Never strip comments with a text replacement that could alter strings, regular expressions, templates, or URLs.
- When cleaning comments or translating developer prose, preserve runtime behavior, interface language, stored formats, and supported integrations. Verify renames and diagnostic changes with the relevant tests.
- Run `pnpm source:check` for the shared regression guard. It checks known language markers and narrow comment anti-patterns, not arbitrary natural language or semantic usefulness. Review uncovered formats and indirect message flows manually; keep localized UI text separate from English technical diagnostics.

# Validation safety

Run integration checks in a disposable contributor checkout without real `.env` files, accounts, recordings, or application configuration. Use the commands documented in `CONTRIBUTING.md`; never launch a production stream or publish artifacts to validate a change.
