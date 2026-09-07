import { preserveArtifact } from "./ffmpeg-evidence.mjs";

// Same identity, atomic download and archive-format checks as evidence collection;
// packaging retains its existing 1 GiB per-source limit. No approval is inferred.
export async function downloadReleaseSources(sources, directory, options = {}) {
  for (const source of sources) {
    await preserveArtifact(
      { ...source, sha256: source.sha256.toLowerCase() },
      directory,
      {
        ...options,
        maxBytes: 1_073_741_824,
      },
    );
  }
}
