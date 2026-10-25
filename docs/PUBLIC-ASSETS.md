# Public assets

Privacy, provenance and review procedure for the versioned assets.
The [review inventory](../compliance/public-assets-review.json) ties the recorded
review to the bytes of each file; updating a hash does not replace inspecting
the material, nor does it prove usage rights.

## Scope and sources of truth

- The inventory covers README screenshots, icons, installer art, editorial
  masters, the site's public images and its SVG icon. The exact roots are checked by the
  [public assets test](../scripts/public-assets.test.ts).
- The [editorial manifest](../web/content/assets/manifest.json) records originals,
  derivatives, provenance, rights and metadata for the site's editorial screenshots. Keep the
  actual version and date of each image; updating the application does not update a screenshot.
- Platform brands and emotes shown in the interface do not become Corneta's
  property. An exposure review grants no rights over those elements.
- Binary sources and dependencies obtained at install/build/runtime
  require their own notices and distribution checks. See the
  [third-party notices](../THIRD_PARTY_NOTICES.md) and
  [FFmpeg compliance](FFMPEG-COMPLIANCE.md).
- Real user reports, videos, conversations and dotenv files are not publishable
  assets. Do not add them to Git and then try to sanitize them.

## Before adding or replacing an asset

1. Use a disposable profile and fake data before capturing. Blur must not be
   the only protection for a real credential.
2. Review the original and the derivative at a readable resolution: window title, paths,
   tooltips, names, URLs, keys, chat, notifications and embedded text/metadata.
   Account keys must not appear, even partially. The local example
   `obs` tied to `127.0.0.1` must not be mistaken for a platform key.
3. Record the provenance and the usage rights; do not classify third-party material
   as your own work. Follow the [editorial protocol](../web/content/README.md)
   for formats, names, metadata and versions.
4. Inspect the SVG both as code and rendered; check every resolution
   of the ICO and the generated outputs. A known format does not prove the content is safe.
5. Only after the review, update the inventory, its date and the relevant manifest.
   Describe in the PR the material reviewed and the limits of the check; do not renew
   hashes in bulk to make the test pass.

### Installer art and icons

The `src-tauri/installer/header.bmp`/`header.png` and
`sidebar.bmp`/`sidebar.png` pairs are versioned on purpose. NSIS consumes the
BMPs; the PNGs let you review the same pixels without opening the installer. Compare
the pairs after regenerating; having both files in Git does not show they are identical.

Run `pnpm installer:art` from the root, on Windows with PowerShell 7 and the dependencies
installed. The generator uses the installed Baloo 2 and warns if it falls back to the
system font; a run with the fallback does not prove an identical reproduction. For icons,
see the [generator](../scripts/make-icons.ps1). Review the outputs and the diff before
updating the inventory. Do not regenerate assets just to clean up comments.

## README screenshots

The images `docs/images/readme/live.webp`, `chat.webp` and `report.webp` show
demo mode with fake data, not a real stream. The README caption
must make that distinction visible. A browser screenshot does not
prove that OBS, the vault, OAuth, the encoder or real platforms work.

The provenance of these images lives in each entry of the
[review inventory](../compliance/public-assets-review.json), in the
`provenance` field: demo origin, synthetic data, captured commit, date and version,
language, dimensions, scenario, capture method and limits of the usage rights.
These images do not belong to the site's editorial manifest, whose originals and
derivatives live in `web/content` and `web/public`.

Each screenshot has its own `reviewedAt` and `reviewScope`, tied to its hash.
Record only the inspection actually performed and who or what performed it;
an assisted visual review is neither a human sign-off nor legal approval.
Do not renew the global review of older assets when adding or replacing a screenshot.
Third-party brands, logos and emotes remain with their respective owners.

To replace a screenshot, prepare a disposable demo with no accounts or personal
data, inspect the final image at a readable resolution and confirm the metadata
before updating only its entry. Keep the historical date and version of the
screenshots that did not change. The test requires the three names, per-image provenance and
the matching hashes; it does not visually check the pixels, nor does it prove
that the recorded metadata is truthful.

## Checks before publishing

```sh
pnpm exec vitest run scripts/public-assets.test.ts
```

Also run the editorial checks described in the [protocol](../web/content/README.md)
and the [secret scan](REPOSITORY-SECURITY.md).

The test checks the complete inventory of the pinned roots, detects
added/removed files, refuses symbolic links/junctions and verifies the hashes.
For Markdown/SVG, it only normalizes CRLF to LF; binaries are compared without
conversion. It does not detect personal data visually, does not replace human
review, does not inspect GitHub attachments and does not cover files outside those roots.

Separately review new attachments, images and text that will be published outside the
inventory. Contacts and public operational data must be intentional and
minimal; do not automatically classify all personal information as a credential.
The general distribution criteria are in the [release gates](RELEASE-GATES.md).
