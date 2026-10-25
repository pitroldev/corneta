# Template: troubleshooting

Create `{locale}/help/troubleshooting/{english-slug}.mdx` with the content of the
YAML block below, without the code fences, starting at `---`. Write the body
after the second `---`; do not copy the title and the instructions of this
template.

```yaml
---
contentId: help_change_me
title: Symptom using the actual interface name
description: Factual description of the symptom and of the scenario where this help applies.
summary: First safe test to confirm the symptom and find the likely cause.
locale: pt-BR
collection: help
kind: troubleshooting
category: troubleshooting
slug: english-slug
status: draft
intent: support
updatedAt: 2026-08-01
reviewedAt: 2026-08-01
productVersion: 0.6.0
testedWith: []
reviewIntervalDays: 90
experimental: false
primaryQuery: localized symptom
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

Structure the body around decisions:

1. exact symptom and expected state;
2. first safe test, from the most likely and cheapest to the most invasive;
3. for each branch: likely cause → how to confirm → fix;
4. how to tell that the fix worked;
5. when to undo the change;
6. which sanitized data to export for support;
7. what never to share.

Keep network, rendering, encoding, authentication and a failure isolated to one
destination apart. Do not hide different hypotheses under “restart everything”.
Screenshots show only the state that removes ambiguity and follow the privacy
protocol in the README.
