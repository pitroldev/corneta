# FFmpeg corresponding source and distribution

Maintenance guide for the third-party package. Corneta pins a static GPL Windows x64 FFmpeg build; distributing that binary also requires reviewing its sources, libraries, patches, recipes and notices. Corneta's own MIT-licensed code does not change the terms of the distributed components. This technical procedure does not replace legal review.

## Sources of truth

| File                                                           | Contents                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [fetch-binaries.ps1](../scripts/fetch-binaries.ps1)            | Versions, URLs and hashes of the pinned sidecars                        |
| [ffmpeg-provenance.json](../compliance/ffmpeg-provenance.json) | FFmpeg commit, recipes, upstream job and OCI digests tied to the binary |
| [ffmpeg-sources.json](../compliance/ffmpeg-sources.json)       | Source archives, pinned URLs, hashes and review decision                |
| [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)            | Distribution notices and terms                                          |

The source manifest keeps `reviewed: false` until the correspondence is approved. `pnpm compliance:check` and `pnpm compliance:prepare` must refuse that state. Having downloaded archives, a valid archive structure or correct hashes does not authorize marking the review as complete.

Artifact identities live in the versioned manifests; review evidence belongs to the corresponding release, without duplicating the counts and results of each collection in this guide.

## Reproducible collection

At the repository root, with the tools described in [development](DEVELOPMENT.md):

```sh
node scripts/collect-ffmpeg-evidence.mjs
node scripts/collect-ffmpeg-evidence.mjs --preserve-binary
node scripts/collect-ffmpeg-evidence.mjs --offline --preserve-binary
node scripts/collect-ffmpeg-evidence.mjs --metadata-only
```

Run the variant you need: the first collects sources/metadata and the selected dependency layer; `--preserve-binary` includes the binary ZIP; `--offline` requires a complete, already verified cache; `--metadata-only` does not download/inspect the library layer.

The output goes to `.artifacts/ffmpeg-evidence/<hash-prefix>/`, ignored by Git:

- `sources/`: archives by commit/hash, including recipes and patches;
- `oci/`: manifest, configuration and selected layer with verified digests;
- `recipe-candidates.json`: candidates extracted from the recipes, not an approved dependency list;
- `pkg-config.json`: metadata installed in the image, when the layer is inspected. Repeated fields go into `duplicateFields`, with every occurrence and without picking an effective value; the resolution used in the build must be checked;
- `binary/`: the original ZIP, when requested;
- `evidence.json`: identities, scope and limitations, with no automatic distribution approval.

It does not require Docker or run images/recipes. Fetching public metadata may use an anonymous read token from the registry, without persisting or printing the token. It does not extract TAR paths onto the system or change `reviewed`.

The collector limits downloads/expansion, re-verifies caches and rejects truncated files, mismatched digests and HTML served with HTTP 200. Its tests are in [ffmpeg-evidence.test.mjs](../scripts/ffmpeg-evidence.test.mjs). These controls prove properties of the bytes, not full source correspondence.

## Correspondence review

1. Cross-check `-version`/`-buildconf`, recipes, build logs and the dependency image of the pinned build. Branches and moving tags such as `latest` do not replace an immutable commit/digest.
2. Identify what was actually linked and its transitive dependencies. The number of recipes or `.pc` files is not the number of distributed libraries: the image may also contain tools, headers and disabled variants.
3. Preserve sources, licenses, notices, submodules, required generated code, inline patches, the lock files actually in effect and build instructions. Review the recipes' conditionals; the first variable named like a commit may not be the one selected for this target.
4. Record the URLs and SHA-256 of the exact archives in the manifest. An HTTP 200 response, a tarball of the current version or the availability of an upstream repository is not enough.
5. Pay special attention to libraries with patches/merged variants, SVN dependencies, submodules and extra source-fetching scripts. Preserve the inputs actually used instead of rerunning commands that update dependencies today.
6. Record who is responsible, the date, the version and the evidence in the PR/release. Change `reviewed` only after the technical review and the necessary expert assessment.

For the pinned build, check the conditional selection of `nv-codec-headers`; the SVN revisions of Xvid and LAME; the x265 patches and variants; libiconv's gnulib; shaderc's `git-sync-deps`; the libjxl/libplacebo submodules; and the dependency updates run by rav1e. This list guides the inspection; it does not prove complete coverage. Get the real archives for the selected x264/dvdcss/dvdread/dvdnav commits: HTML returned as a download is not corresponding source.

If the vendor's correspondence cannot be proven, a controlled build requires an explicit decision, preserved inputs and new media/performance tests. Do not swap the binary or silently remove codecs to make the gate pass. See the [FFmpeg distribution terms](https://ffmpeg.org/legal.html).

## Packaging and availability

After preparing the verified sidecars and approving the manifest:

```sh
pnpm compliance:check
pnpm compliance:prepare
```

Inspect `corneta-third-party.zip`: sources, notices, inventories and hashes must match the shipped executables. The package includes this guide and the provenance manifests; it does not turn references to the repository into files included in the ZIP.

The [downloader](../scripts/fetch-binaries.ps1) first tries the repository's own mirror prerelease, which holds the **same pinned bytes** and the matching `corneta-third-party.zip`; `CORNETA_FFMPEG_MIRROR_URL` can put another durable source in front of it. When pinning a different build, publish the new mirror prerelease before changing the URL in the script. It has to be a **prerelease**: a regular release would become Latest, without the `latest.json` that the updater downloads, and a tag outside the `v*` pattern would also stop later versions from becoming Latest again. A local cache is not a public mirror, and upstream may withdraw artifacts. If the correct file is missing, the download must fail; never fall back to `latest` or accept another hash automatically.

Make the relevant compliance materials available alongside the approved installer and check that they download before publishing the version. Blocking a package that contains third-party binaries is not the same as preventing publication of the project's own code alone; keep the boundaries described in the third-party notices clear.
