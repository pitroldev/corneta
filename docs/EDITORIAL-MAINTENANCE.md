# Corneta editorial maintenance

This runbook keeps Help and Guides reliable after publication. The goal is
not to bump dates: it is to confirm that instructions, rules, images and
links still help someone complete the task described.

## Dates in use

- `reviewedAt`: last factual or technical review, even when the text did not
  need to change.
- `updatedAt`: last substantial change a reader would notice.
- `sources[].reviewedAt`: last time that specific source was
  checked.
- `reviewIntervalDays`: maximum time between reviews. Comparisons use 60 to
  90 days; volatile content uses at most 90; stable concepts may use 180.

Changing an instruction, conclusion, recommendation, screenshot or relevant
data point requires advancing `updatedAt`. Checking everything and concluding
that it is still correct advances only `reviewedAt` and the dates of the
sources actually verified. Never change `updatedAt` just to look fresh.

Dates are the day only (`2026-10-18`). If the same article is reviewed again
on the same day, these three dates accept the local time (`2026-10-18T21:30`)
so that the gate sees the advance. The page, the sitemap and the JSON-LD still
show only the day.

## Automatic queue

In the `web` directory, run:

```powershell
pnpm content:maintenance
pnpm content:maintenance --as-of 2026-08-02 --warning-days 28
pnpm content:maintenance:check
```

The last command fails when an article is overdue. The automatic production build on Vercel only
prints this queue: an overdue article does not block the deploy, so that API or security fixes
are not held up. Explicit release builds (`build:release` or `CORNETA_RELEASE_CHECK=1`) still
refuse an overdue article, so run the queue regularly and before every release.

## How to review an article

1. Open the product and redo the flow with the versions declared in `testedWith`.
2. Check every official source, limit, rule and integration. Update
   `sources[].reviewedAt` only for sources you actually opened and read.
3. Compare screenshots with the current interface. Replace the image if the difference
   could confuse the reader; keep the metadata in the asset manifest.
4. Test internal links, the contextual CTA, related articles and the search used
   as `primaryQuery`.
5. Fix the content and advance `updatedAt` if something changed. If nothing changed, advance
   only `reviewedAt`.
6. Run `pnpm content:check` and the site tests before submitting.

If the review is limited to a changed internal source, check the claims that depend on it and
describe that scope in the PR. Advance only the dates that are actually justified; do not update
`testedWith`, external sources or screenshots that were not revalidated. The distinction between
documentation review and product testing is in the [editorial contract](../web/content/README.md).

## Product changes and releases

Articles can declare internal files in `sources[].repoPath`. In pull
requests, CI cross-checks those paths against the diff and requires a new review of the article and
of the affected source. On release, the same gate compares the current tag with the previous
tag and also requires `productVersion` to match the published version.

To reproduce it, run from the repository root. Replace `BASE_REF` with the tag or
reference commit available locally; use the product version you are reviewing:

```powershell
pnpm --dir web content:revision:check --base origin/main --head HEAD
pnpm --dir web content:revision:check --base BASE_REF --head HEAD --product-version 0.7.0
```

When the change in the source does not alter anything the article states, record that instead of
faking a review. This applies to refactoring, performance work or code with no effect on a cited
label, flow, message, limit or behavior. With the source already committed, run from the root:

```powershell
pnpm --dir web content:impact:declare --article pt-BR/help/quality/quality-modes.mdx --source src/screens/EncodingScreen.tsx --reason "Memoized the estimates; no cited label, limit or flow changed."
```

The command writes one declaration per article and source to `web/content/source-impact.json`. It
stores the reason and the Git blob of the source at `HEAD`. It is valid only for that exact content: if the
source changes again, the gate once more requires a review or a new declaration. Read the article's
claims that depend on the source before declaring. If any of them changed, review the article. The
declaration also counts for the release gate.

The source diff used by the command compares Git references, not uncommitted
changes. The content comparison normalizes formatting in both bodies with the Prettier version
pinned in the lockfile; merely aligning tables or rewrapping lines does not require a new `updatedAt`.

If a relevant change does not trigger the gate, add to the article the `repoPath`
closest to the documented behavior. Do not use a broad directory as a
shortcut: the source must make it possible to locate the concrete rule or screen.
