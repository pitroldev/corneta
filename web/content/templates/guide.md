# Template: guide

Create `{locale}/guides/{english-category}/{english-slug}.mdx` with the content
of the YAML block below, without the code fences, starting at `---`. Write the
body after the second `---`; do not copy the title and the instructions of this
template.

```yaml
---
contentId: guide_change_me
title: Localized title that answers the query
description: Unique, factual description of 40 to 180 characters.
summary: Direct answer in two to four sentences.
locale: pt-BR
collection: guides
kind: guide
category: multistream
slug: english-slug
status: draft
intent: informational
updatedAt: 2026-08-01
reviewedAt: 2026-08-01
productVersion: 0.6.0
testedWith: []
reviewIntervalDays: 90
experimental: false
primaryQuery: localized main query
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

1. direct answer and the scenario where it applies;
2. version, environment and test method;
3. reproducible decision, calculation or procedure;
4. own evidence and primary sources next to the claim;
5. limits, including when Corneta is not the best option;
6. next step and a contextual related link.

Use H2 and H3; the route template creates the H1.

For an inline image, declare it in `frontmatter.images` and use it exactly once:
`<ContentImage baseName="english-base-name" />`. Do not use Markdown syntax or
`<img>`.
