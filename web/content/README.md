# Corneta editorial content

This folder is the versioned source of **Guides** and **Help**. The public files
are generated from validated MDX; content with `status: draft` never enters the
public listings, the sitemap, the alternates or the route lookup.

## Structure

```text
content/
  assets/
    manifest.json
    originals/
  templates/
  pt-BR/
    guides/{category}/{slug}.mdx
    help/{category}/{slug}.mdx
  en/
    guides/{category}/{slug}.mdx
    help/{category}/{slug}.mdx
  people.json
```

All URL segments, categories, slugs, asset directories and filenames must be in
English, in lowercase kebab-case. This holds even when the title, text, alt and
caption are in Portuguese. Examples:

- `/guides/multistream/obs-multistream`;
- `/help/getting-started/first-stream`;
- `/en/help/troubleshooting/obs-not-found`;
- `corneta-platform-status-connected.webp`.

The allowed categories and the versioned registry
`EDITORIAL_ENGLISH_PATH_APPROVALS` are exported by
`lib/editorial/constants.ts`. The regex only validates the lowercase ASCII
kebab-case shape: before creating a file, a person must confirm that the whole
path is in English, add it to the registry and bump its version. Do not create a
category or path only in the filesystem: change the contract, the navigation and
the tests together.

## Frontmatter contract

Use a file from `templates/` as the starting point. The example below is a
draft: it attributes neither authorship nor review to anyone. Drafts may omit
fields that are not validated yet; to publish, also fill in `author`,
`reviewedBy` and `publishedAt`.

```yaml
contentId: guide_obs_multistream
title: Como fazer multistream no OBS Studio
description: Unique, factual description for search and sharing.
summary: Short answer shown at the start of the article.
locale: pt-BR
collection: guides
kind: guide
category: multistream
slug: obs-multistream
translationKey: obs-multistream
status: draft
intent: informational
updatedAt: 2026-08-01
reviewedAt: 2026-08-01
productVersion: 0.6.0
testedWith:
  - name: Corneta
    version: 0.6.0
    environment: Windows 11
reviewIntervalDays: 90
experimental: false
primaryQuery: como fazer multistream no OBS
related: []
sources:
  - title: Corneta product reference
    kind: internal
    repoPath: web/PRODUCT.md
    reviewedAt: 2026-08-01
images: []
```

The example is the `pt-BR` file, so its `title` and `primaryQuery` are in
Portuguese. Every article is created for both locales: the `en` file lives under
`en/`, sets `locale: en`, keeps the same `translationKey`, collection, category
and slug, and needs its own `contentId` (by convention the same id with `_en`,
here `guide_obs_multistream_en`).

The dates and versions in the example are illustrative: replace them with the
review and the tests you actually did. When publishing, add the identities and `publishedAt`. The auditor requires a reviewed source,
a tested version, and an author and a reviewer registered in `people.json`. Articles do not use
a cover image; useful screenshots go in the body, next to the step they explain.
Dates use `YYYY-MM-DD`; do not bump `updatedAt` without a substantial revision. For a second revision of the same article on the same day, `updatedAt`, `reviewedAt` and `sources[].reviewedAt` accept the local time (`YYYY-MM-DDTHH:MM`); it only orders the revisions, and the site shows the day.

A review limited to one internal source may advance the `reviewedAt` of the article and of that source after checking the claims that depend on it. Describe the scope in the PR review; keep `updatedAt` if the body did not change, along with the dates of external sources you did not revisit, `testedWith` and the real versions/dates of the captures. `productVersion` states which version the documentation was reviewed against; it does not declare a new live test. The revision gate does not replace this check.

The gate compares the bodies after normalizing both with the lockfile's Prettier, using the same fixed options. Aligning tables or rewrapping JSX lines must not create an editorial update date. Changes to text, tags, props and substantive metadata still require `updatedAt`; changes to internal sources still require the matching review. This normalizer is contributor tooling, not part of the public bundle.

### Identity and authorship

The `contentId` is a stable telemetry identifier, not a URL. Use `help_...` or
`guide_...`, with only lowercase letters, digits and underscores, and never
reuse a removed ID for another subject.

`people.json` records the factual type (`person` or `organization`) and the URL
of each byline. Published content requires an author and a reviewer of type
`person`, with a URL; do not represent a team or a company as `Person` in the
structured data. Fill in `author` with whoever wrote the article, and
`reviewedBy` only after the review has actually happened and with the agreement
of the named person. Use the exact name from the registry; register the person
with their public profile when needed. Do not use example names or
automatically attribute the review to the maintainer. The auditor rejects
missing fields, known placeholders and unregistered identities, but it does not
prove that the review happened: that confirmation is part of the PR.

The page template already renders the `title` as the H1. So the MDX body starts
at H2 (`##`). H2 and H3 build the table of contents automatically. GFM Markdown
is accepted; internal links must use the public English URL.

Images in the body only use a literal identifier already declared in
`frontmatter.images`:

```mdx
<ContentImage baseName="corneta-platform-status-connected" />
```

Do not use `![]()`, `<img>` or `<EditorialImage>` directly. The template
resolves src, alt, caption, dimensions and provenance from the frontmatter. Each
item in `images` must appear exactly once in the body.

## Translations

The site is bilingual: all published content needs complete `pt-BR` and `en`
versions, both published and linked by the same `translationKey`, with the same
collection, category and slug. `content:check` fails a published article without
that pair. Drafts may exist in a single language while the translation is not
ready. The loader only exposes alternates when the pair is reciprocal.

Translation does not mean copying screenshots in the wrong language. Each image
declares `language: pt-BR`, `language: en` or `language: none`. Use `none` only
when the visual contains no text and no localized interface.

## Reproducible screenshot protocol

Before capturing:

1. use a dedicated demo account and profile;
2. fill channels, titles and messages with plausible fictional data;
3. record the Corneta version, the external software version, Windows, language,
   theme, scale and window size;
4. turn off notifications and close the windows that are not part of the
   tutorial;
5. reproduce the state from the start and confirm the expected result;
6. capture the original image as PNG, without resizing or annotating it;
7. review the original at 100% zoom before producing the derivative.

An image is rejected if it shows, even partially:

- a stream key, token, password, API key, cookie or URL with credentials;
- the e-mail, account, chat, avatar or name of a real person;
- a real telemetry, operation, report or error ID;
- a local path, Windows username, IP or personal notification;
- an adjacent screen or any data the task does not need.

Do not use blur as the only protection for a secret. Prepare fictional data
before capturing and prefer cropping the region. OCR and pattern search can
complement, but never replace, human review of the original file.

Screenshots of Twitch, YouTube, Kick and OBS only go in when the visual location
prevents a real mistake. Record `capturedAt` and `externalUiReviewedAt`; for
OBS, also record `sourceVersion` with the captured version. `productVersion`
stays reserved for the Corneta version. These fields live only in the manifest. Check the current brand rules and redo the capture when the
interface changes. Do not copy images from help centers.

## Asset pipeline and manifest

The master and the derivative are different files:

```text
content/assets/originals/multistream/obs-multistream-flow.png
public/images/editorial/multistream/obs-multistream-flow.webp
```

1. keep the sanitized master in `content/assets/originals/`;
2. export screenshots or raster art as WebP or AVIF with the reproducible
   command; diagrams may be SVG;
3. keep each derivative under **512 KiB**;
4. preserve the aspect ratio, mobile legibility and declared dimensions;
5. add the master and every derivative to `assets/manifest.json`;
6. in the article, list the image in `images` with only `baseName`, `alt` and,
   if there is one, `caption`; file, dimensions, provenance and dates come from
   the manifest, and the first derivative is the one the article uses;
7. run `pnpm content:check` inside `web`.

Example run from `web/`:

```powershell
pnpm content:image --input assets/originals/multistream/obs-multistream-flow.png --output images/editorial/multistream/obs-multistream-flow.webp --width 1600 --quality 82
```

The command reads only inside `content/assets/originals`, writes only inside
`public/images/editorial`, requires the same `baseName`, refuses to overwrite
without `--force` and fails before writing if the output exceeds 512 KiB. Copy
the `src`, width, height and bytes it prints into the manifest; use `--force`
only after reviewing the change to the derivative.

The auditor rejects PNG/JPEG as a public derivative, missing files, names
outside the convention, byte overruns, declared dimensions that differ from the
manifest, real dimensions that differ from the manifest, a mismatched language
and unregistered assets. Masters and derivatives must also be readable images
whose real format matches the extension; EXIF, XMP, IPTC, ICC, comments and
Photoshop metadata must not remain in either the versioned file or the public
one.

SVG is parsed as strict XML and limited to a passive allowlist. Do not use
scripts, `foreignObject`, `on*` handlers, CSS, animation, links or external
resources; every SVG must have exactly one direct, non-empty `<title>` and
`<desc>`. `next/image` still negotiates and optimizes the format delivered to
the browser; that does not remove the obligation to keep a public derivative
that is lean, traceable and separate from the master.

`baseName` must be identical to the name, without extension, of the master and
the derivative. The automatic syntax validation only guarantees lowercase ASCII
kebab-case. Human review confirms that directories, filenames and `baseName`
are in English, adds the exact `src` to `EDITORIAL_ENGLISH_ASSET_PATH_APPROVALS`
and bumps the version of that registry before the path is used in the manifest.
The `baseName` and the master must mirror that path: same name and same
directories under `assets/originals`. Approving only the filename does not approve its directories. The frontmatter acts as the localized use of the asset (alt and
caption); the manifest is the single source of file, provenance, rights, dates,
version and variants. Swapping a capture in the manifest changes what the reader
sees, so the revision gate requires a new `updatedAt` on the articles that use
it.

AI-generated images are allowed only as abstract support. They may never
simulate Corneta, OBS, a platform, an error, a metric or proof of a feature.
Record the model and the date in the manifest. For flows and explanations,
prefer an original SVG and keep the same information in nearby HTML.

## Publishing process

1. validate the intent, overlap and `contentId`;
2. start from the right template;
3. perform the task on the declared version;
4. write the direct answer first, then the details;
5. prepare the primary sources and the visual package;
6. do a technical and an editorial review with registered people;
7. switch to `status: published` only when the auditor passes;
8. confirm the canonical, the social image and the links in the preview;
9. publish, and review again at the declared interval.

Comparisons require a recent hands-on test and an explicit methodology.
Troubleshooting follows “symptom → likely cause → how to confirm → fix”.
Do not turn an experimental feature into a stable promise.
