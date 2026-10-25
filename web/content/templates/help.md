# Template: help

Create `{locale}/help/{english-category}/{english-slug}.mdx` with the content of
the YAML block below, without the code fences, starting at `---`. Write the body
after the second `---`; do not copy the title and the instructions of this
template.

```yaml
---
contentId: help_change_me
title: Outcome or task using the actual interface name
description: Unique, factual description of 40 to 180 characters.
summary: Expected outcome and the main condition for reaching it.
locale: pt-BR
collection: help
kind: help
category: getting-started
slug: english-slug
status: draft
intent: support
updatedAt: 2026-08-01
reviewedAt: 2026-08-01
productVersion: 0.6.0
testedWith: []
reviewIntervalDays: 90
experimental: false
primaryQuery: localized task
related: []
sources: []
images: []
---
```

The site publishes every article in `pt-BR` and `en`. Create the file once per
locale, under `pt-BR/` with `locale: pt-BR` and under `en/` with `locale: en`,
keeping the same collection, category and slug, and add the same
`translationKey` (the slug) to both. Each file needs its own `contentId`; the
`en` one appends `_en`.

The dates and versions are examples. Before publishing, replace them with real
evidence and fill in `publishedAt`, `author` and `reviewedBy`, following the
[authorship contract](../README.md#identity-and-authorship). Do not attribute a
review before it happens.

Body order:

1. expected outcome;
2. “applies to” and prerequisites;
3. numbered steps with the expected state at the critical points;
4. symptoms, causes, confirmation and fix;
5. safe data to collect if the problem persists;
6. an explicit warning about what never to share.

Use exactly the names visible in the tested version.

Each inline image must be in `frontmatter.images` and appear once as
`<ContentImage baseName="english-base-name" />`. The hero does not go in the
body.
