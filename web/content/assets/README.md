# Editorial assets

- `originals/` holds sanitized masters, with no additional lossy compression.
- `manifest.json` records the provenance and every public derivative.
- Derivatives live in `web/public/images/editorial/`, outside this folder.
- Master and derivative use the same `baseName`, in English and kebab-case.
- Do not put secrets in the masters: they are versioned in the repository.

The full protocol, including privacy, formats, language and the 512 KiB
budget, is in `../README.md`.
