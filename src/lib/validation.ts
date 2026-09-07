import type { I18n, MessageKey } from "./i18n";
import type { Target } from "./types";

export const INGEST_URL_RE = /^rtmps?:\/\/\S+/i;
/** A scheme without a host is an incomplete preset, treated as empty. */
const BARE_SCHEME_RE = /^rtmps?:\/\/$/i;

/** Use stable issue codes for control flow; localized text must not decide whether startup is blocked. */
export type TargetIssue = "noName" | "noUrl" | "badUrl" | "noKey";

const ISSUE_KEYS: Record<TargetIssue, MessageKey> = {
  noName: "core.target.issue.noName",
  noUrl: "core.target.issue.noUrl",
  badUrl: "core.target.issue.badUrl",
  noKey: "core.target.issue.noKey",
};

export function targetIssueCodes(target: Target): TargetIssue[] {
  const issues: TargetIssue[] = [];
  if (!target.name.trim()) issues.push("noName");
  const url = target.ingestUrl.trim();
  if (!url || BARE_SCHEME_RE.test(url)) issues.push("noUrl");
  else if (!INGEST_URL_RE.test(url)) issues.push("badUrl");
  if (target.enabled && !target.hasKey) issues.push("noKey");
  return issues;
}

/** Missing keys or URLs block startup; an empty name only warns. */
export function blockingIssueCodes(target: Target): TargetIssue[] {
  return targetIssueCodes(target).filter((i) => i !== "noName");
}

export const issueText = (issue: TargetIssue, t: I18n["t"]): string =>
  t(ISSUE_KEYS[issue]);

export function targetIssues(target: Target, t: I18n["t"]): string[] {
  return targetIssueCodes(target).map((i) => issueText(i, t));
}

export function blockingIssues(target: Target, t: I18n["t"]): string[] {
  return blockingIssueCodes(target).map((i) => issueText(i, t));
}

export function isUrlInvalid(t: Target): boolean {
  const url = t.ingestUrl.trim();
  return (
    url.length > 0 && !BARE_SCHEME_RE.test(url) && !INGEST_URL_RE.test(url)
  );
}

export function hasValidUrl(t: Target): boolean {
  return INGEST_URL_RE.test(t.ingestUrl.trim());
}

/** Extract a stream key from a pasted URL while preserving its query string. A server-only URL yields an empty key; otherwise retain the trimmed input if extraction is empty. */
export function sanitizeStreamKey(
  raw: string,
  ingestUrl?: string,
): { key: string; strippedUrl: boolean } {
  const trimmed = raw.trim();

  const base = ingestUrl?.trim().replace(/\/+$/, "");
  // Only complete ingest URLs can define a known server prefix.
  const hasBase = !!base && base.includes("://");

  // The known server, its prefix, or a matching regional app path contains no stream key.
  if (hasBase && trimmed.includes("://") && !trimmed.includes("?")) {
    const noSlash = trimmed.replace(/\/+$/, "").toLowerCase();
    const baseLower = base.toLowerCase();
    const isPrefixOfBase =
      baseLower === noSlash || baseLower.startsWith(noSlash + "/");
    const lastPathSeg = (u: string) => {
      const rest = u.slice(u.indexOf("://") + 3);
      const s = rest.indexOf("/");
      return s === -1 ? "" : rest.slice(rest.lastIndexOf("/") + 1);
    };
    const baseApp = lastPathSeg(baseLower);
    const sameApp = baseApp !== "" && lastPathSeg(noSlash) === baseApp;
    if (isPrefixOfBase || sameApp) return { key: "", strippedUrl: true };
  }

  if (base && trimmed.startsWith(base + "/")) {
    const key = trimmed.slice(base.length).replace(/^\/+/, "");
    if (key) return { key, strippedUrl: true };
  }

  // Separate the query before taking the final path segment so key parameters survive.
  if (trimmed.includes("://")) {
    const q = trimmed.indexOf("?");
    const path = q === -1 ? trimmed : trimmed.slice(0, q);
    const query = q === -1 ? "" : trimmed.slice(q);
    const key = path.slice(path.lastIndexOf("/") + 1) + query;
    if (key) return { key, strippedUrl: true };
  }

  return { key: trimmed, strippedUrl: false };
}

function stripWrappingQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && /^["'`]/.test(t) && t.endsWith(t[0]))
    return t.slice(1, -1).trim();
  return t;
}

/** Extract a fixed-format YouTube API key; otherwise remove surrounding quotes and whitespace. */
export function sanitizeApiKey(raw: string): string {
  const m = raw.match(/AIza[0-9A-Za-z_-]{35}/);
  if (m) return m[0];
  return stripWrappingQuotes(raw).replace(/\s+/g, "");
}

/** Opaque tokens have no fixed format; strip pasted labels, Bearer prefixes, quotes and whitespace. */
export function sanitizeToken(raw: string): string {
  let t = stripWrappingQuotes(raw)
    .replace(/^bearer\s+/i, "")
    .trim();
  const labelled = t.match(/(?:token|jwt)\s*[:=]\s*([^\s&"']+)/i);
  if (labelled) t = labelled[1];
  return t.replace(/\s+/g, "");
}

export function sanitizeIngestUrl(raw: string): string {
  const t = stripWrappingQuotes(raw).replace(/\s+/g, "");
  return BARE_SCHEME_RE.test(t) ? "" : t;
}

/** Extract only the hostname; port and app path have separate configuration fields. */
export function sanitizeHost(raw: string): string {
  let t = stripWrappingQuotes(raw).replace(/\s+/g, "");
  t = t.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  t = t.split(/[/?#]/)[0];
  t = t.replace(/:\d+$/, "");
  return t;
}
