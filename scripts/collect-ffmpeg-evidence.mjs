// Inspect vendor artifacts without executing them or approving corresponding sources.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  hashFile,
  imageEvidence,
  preserveArtifact,
  readPackageMetadata,
  readRecipeMetadata,
  validateArtifact,
} from "./ffmpeg-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (file) =>
  JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));

export function collectionOptions(args) {
  const allowed = new Set([
    "--offline",
    "--metadata-only",
    "--preserve-binary",
  ]);
  if (
    args.some((argument) => !allowed.has(argument)) ||
    new Set(args).size !== args.length
  ) {
    throw new Error(
      "Usage: node scripts/collect-ffmpeg-evidence.mjs [--offline] [--metadata-only] [--preserve-binary]",
    );
  }
  return {
    offline: args.includes("--offline"),
    metadataOnly: args.includes("--metadata-only"),
    preserveBinary: args.includes("--preserve-binary"),
  };
}

export async function collectEvidence(args = process.argv.slice(2)) {
  const options = collectionOptions(args);
  options.budget = { remaining: 512 * 1024 * 1024 };
  const manifest = loadJson(join(root, "compliance/ffmpeg-sources.json"));
  const provenance = loadJson(join(root, "compliance/ffmpeg-provenance.json"));
  if (
    provenance.schemaVersion !== 1 ||
    manifest.schemaVersion !== 1 ||
    provenance.ffmpegArchiveSha256 !== manifest.ffmpegArchiveSha256 ||
    !/^[a-f0-9]{64}$/.test(manifest.ffmpegArchiveSha256)
  ) {
    throw new Error(
      "Source manifest and provenance refer to different builds.",
    );
  }
  const directory = join(
    root,
    ".artifacts",
    "ffmpeg-evidence",
    manifest.ffmpegArchiveSha256.slice(0, 16),
  );
  const sourcesDirectory = join(directory, "sources");
  const ociDirectory = join(directory, "oci");
  mkdirSync(sourcesDirectory, { recursive: true });
  mkdirSync(ociDirectory, { recursive: true });
  const sources = [];
  for (const source of manifest.sources) {
    validateArtifact(source);
    // Reuse the previously inspected local archive only after checking its hash.
    const previous = join(root, ".artifacts/ffmpeg-source-review", source.file);
    const target = join(sourcesDirectory, source.file);
    if (
      !existsSync(target) &&
      existsSync(previous) &&
      (await hashFile(previous)).sha256 === source.sha256
    ) {
      copyFileSync(previous, target);
    }
    sources.push(await preserveArtifact(source, sourcesDirectory, options));
  }
  const recipeSource = sources.find((source) =>
    source.url.endsWith(`/${provenance.releaseRecipeCommit}`),
  );
  if (!recipeSource)
    throw new Error("Pinned recipe archive missing from the source manifest.");
  const recipes = await readRecipeMetadata(
    join(sourcesDirectory, recipeSource.file),
    provenance.releaseRecipeCommit,
  );
  writeFileSync(
    join(directory, "recipe-candidates.json"),
    `${JSON.stringify(recipes, null, 2)}\n`,
  );

  const repository = provenance.image.repository;
  if (!/^btbn\/ffmpeg-builds\/[a-z0-9.-]+$/.test(repository))
    throw new Error("Unexpected OCI repository.");
  let token;
  const registryFetch = async (url, init = {}) => {
    if (!token) {
      const response = await fetch(
        `https://ghcr.io/token?scope=repository:${repository}:pull`,
        { signal: AbortSignal.timeout(30_000) },
      );
      if (!response.ok)
        throw new Error("Anonymous public registry access failed.");
      const body = await response.json();
      if (typeof body.token !== "string" || body.token.length > 16_384)
        throw new Error("Invalid registry authorization response.");
      token = body.token;
    }
    // This is an anonymous, read-only registry token, not a user's credential.
    // Fetch strips Authorization on cross-origin redirects; never persist it.
    return fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
  };
  const getOCI = async (digest, kind, maxBytes) => {
    if (!/^sha256:[a-f0-9]{64}$/.test(digest))
      throw new Error("Invalid OCI digest.");
    const source = {
      file: `${digest.slice(7)}.${kind === "manifests" ? "manifest.json" : "blob"}`,
      sha256: digest.slice(7),
      url: `https://ghcr.io/v2/${repository}/${kind}/${digest}`,
    };
    const result = await preserveArtifact(source, ociDirectory, {
      ...options,
      maxBytes,
      fetchImpl: registryFetch,
      headers: {
        Accept:
          "application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json",
      },
    });
    return { ...result, local: join(ociDirectory, source.file) };
  };
  const imageManifestFile = await getOCI(
    provenance.image.digest,
    "manifests",
    1024 * 1024,
  );
  const imageManifest = loadJson(imageManifestFile.local);
  if (imageManifest.config?.digest !== provenance.image.configDigest)
    throw new Error("OCI config digest changed.");
  const configurationFile = await getOCI(
    provenance.image.configDigest,
    "blobs",
    1024 * 1024,
  );
  const configuration = loadJson(configurationFile.local);
  const image = imageEvidence(imageManifest, configuration, provenance);
  let packages = [];
  if (!options.metadataOnly) {
    // Only the verified library-prefix layer (~104 MiB), never all image layers.
    if (image.dependencyLayer.bytes > 160 * 1024 * 1024)
      throw new Error("Dependency layer exceeds collection budget.");
    const layer = await getOCI(
      image.dependencyLayer.digest,
      "blobs",
      160 * 1024 * 1024,
    );
    packages = await readPackageMetadata(layer.local);
    writeFileSync(
      join(directory, "pkg-config.json"),
      `${JSON.stringify(packages, null, 2)}\n`,
    );
  }
  let binary = null;
  if (options.preserveBinary) {
    const script = readFileSync(
      join(root, "scripts/fetch-binaries.ps1"),
      "utf8",
    );
    const url = script.match(/^\$ffmpegUrl\s*=\s*'([^']+)'/m)?.[1];
    const sha = script
      .match(/^\$ffmpegSha256\s*=\s*'([A-Fa-f0-9]+)'/m)?.[1]
      ?.toLowerCase();
    if (sha !== manifest.ffmpegArchiveSha256 || !url)
      throw new Error("Sidecar pin differs from source evidence.");
    const binaryDirectory = join(directory, "binary");
    mkdirSync(binaryDirectory, { recursive: true });
    const file = `ffmpeg-${sha}.zip`;
    const existingCache = join(
      tmpdir(),
      "corneta-bins-cache",
      `${sha.toUpperCase()}.zip`,
    );
    if (
      !existsSync(join(binaryDirectory, file)) &&
      existsSync(existingCache) &&
      (await hashFile(existingCache)).sha256 === sha
    ) {
      copyFileSync(existingCache, join(binaryDirectory, file));
    }
    binary = await preserveArtifact(
      { file, sha256: sha, url },
      binaryDirectory,
      options,
    );
  }
  const summary = {
    schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    mode: options.metadataOnly ? "metadata-only" : "dependency-metadata",
    ffmpegArchiveSha256: manifest.ffmpegArchiveSha256,
    distributionApproved: false,
    image,
    sources,
    recipeCandidates: recipes.length,
    packageMetadataCount: packages.length,
    binary,
    limitations: provenance.limitations,
  };
  writeFileSync(
    join(directory, "evidence.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      {
        directory: `.artifacts/ffmpeg-evidence/${manifest.ffmpegArchiveSha256.slice(0, 16)}`,
        sources: sources.length,
        imageCreated: image.created,
        imageLayers: image.layerCount,
        imageCompressedBytes: image.totalCompressedBytes,
        selectedLayerBytes: image.dependencyLayer.bytes,
        packageMetadataCount: packages.length,
        binaryPreserved: !!binary,
        distributionApproved: false,
      },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  collectEvidence().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
