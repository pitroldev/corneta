// Packaging metadata does not prove that the corresponding-source review is complete.
export const compliancePackageFiles = [
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "pnpm-lock.yaml",
  "src-tauri/Cargo.lock",
  "compliance/ffmpeg-sources.json",
  "compliance/ffmpeg-provenance.json",
  "docs/CONFORMIDADE-FFMPEG.md",
];

export function complianceErrors(manifest, sidecars) {
  const errors = [];
  if (manifest?.schemaVersion !== 1 || manifest.reviewed !== true)
    errors.push(
      "GPL corresponding sources still require explicit review in compliance/ffmpeg-sources.json.",
    );
  if (
    sidecars?.ffmpeg?.verified !== true ||
    typeof sidecars?.ffmpeg?.archiveSha256 !== "string" ||
    typeof manifest?.ffmpegArchiveSha256 !== "string" ||
    !/^[a-f0-9]{64}$/i.test(sidecars?.ffmpeg?.archiveSha256 ?? "") ||
    !/^[a-f0-9]{64}$/i.test(manifest?.ffmpegArchiveSha256 ?? "") ||
    manifest.ffmpegArchiveSha256.toLowerCase() !==
      sidecars.ffmpeg.archiveSha256.toLowerCase()
  )
    errors.push(
      "The source package does not identify this build's verified FFmpeg archive.",
    );
  if (!Array.isArray(manifest?.sources) || !manifest.sources.length) {
    errors.push(
      "Register the corresponding source archives (FFmpeg, GPL libraries, build scripts, and patches).",
    );
    return errors;
  }
  const names = new Set();
  for (const source of manifest.sources) {
    if (!source || typeof source !== "object") {
      errors.push("Invalid source entry.");
      continue;
    }
    const file = source.file;
    if (
      typeof file !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(?:zip|tar\.xz|tar\.gz)$/.test(
        file,
      ) ||
      names.has(file.toLowerCase())
    )
      errors.push("Invalid or duplicate source filename.");
    else names.add(file.toLowerCase());
    if (!/^[a-f0-9]{64}$/i.test(source.sha256 ?? ""))
      errors.push("Each source archive requires a pinned SHA-256.");
    try {
      const url = new URL(source.url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        /\/(?:latest|main|master)(?:\/|$)/.test(url.pathname)
      )
        throw new Error();
    } catch {
      errors.push(
        "Source URLs must use HTTPS and a fixed version, without credentials or rolling branches/tags.",
      );
    }
  }
  return errors;
}
