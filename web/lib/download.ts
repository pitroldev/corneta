export const DOWNLOAD_PATH = "/download";
export const RELEASES_URL =
  "https://github.com/pitroldev/corneta/releases/latest";

// Only official release assets can become download redirects.
export function downloadMetadata(value: string | undefined) {
  try {
    const url = new URL(value?.trim() ?? "");
    if (
      url.origin !== "https://github.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    const match =
      /^\/pitroldev\/corneta\/releases\/(?:download\/v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)|latest\/download)\/[A-Za-z0-9._-]+\.exe$/.exec(
        url.pathname,
      );
    if (!match) return null;
    return { url: url.toString(), version: match[1] ?? null };
  } catch {
    return null;
  }
}
