// Production downloads are restricted to this project's release assets. This
// validates identity/shape only; publication still requires a real download test.
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
      /^\/pitroldev\/corneta\/releases\/(?:download\/v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)|latest\/download)\/[^/]+\.exe$/i.exec(
        url.pathname,
      );
    if (!match) return null;
    return { url: url.toString(), version: match[1] ?? null };
  } catch {
    return null;
  }
}
