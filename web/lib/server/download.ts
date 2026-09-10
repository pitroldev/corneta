import "server-only";

import { downloadMetadata, RELEASES_URL } from "../download";
import { readBoundedText } from "./bounded-body";

const MANIFEST_URL = `${RELEASES_URL}/download/latest.json`;
const MAX_MANIFEST_BYTES = 65_536;
const MANIFEST_TIMEOUT_MS = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function manifestDownloadUrl(manifest: unknown): string | null {
  if (!isRecord(manifest) || !isRecord(manifest.platforms)) return null;
  const platform = manifest.platforms["windows-x86_64"];
  if (!isRecord(platform) || typeof platform.url !== "string") return null;
  const download = downloadMetadata(platform.url);
  if (!download?.version || download.version !== manifest.version) return null;
  return download.url;
}

export async function latestInstallerUrl(): Promise<string | null> {
  try {
    const response = await fetch(MANIFEST_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return null;
    }
    const body = await readBoundedText(
      response.body,
      MAX_MANIFEST_BYTES,
      MANIFEST_TIMEOUT_MS,
    );
    return manifestDownloadUrl(JSON.parse(body));
  } catch {
    return null;
  }
}
