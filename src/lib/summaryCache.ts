import type { SessionMeta, SessionSummary } from "./types";

const KEY = "corneta.session-summaries";
const VERSION = 5;
const CAP = 50;
interface Entry {
  summary: SessionSummary;
  revision?: string;
}
let storage: Storage | undefined;
let entries: Record<string, Entry> | undefined;
let revisions = new Map<string, string | undefined>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function read(): Record<string, Entry> {
  try {
    if (storage === localStorage && entries) return entries;
    storage = localStorage;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = undefined;
    revisions = new Map();
    const parsed: unknown = JSON.parse(storage.getItem(KEY) ?? "null");
    entries = Object.create(null) as Record<string, Entry>;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as { version?: number }).version === VERSION
    ) {
      const raw = (parsed as { entries?: unknown }).entries;
      if (raw && typeof raw === "object") {
        for (const [id, entry] of Object.entries(raw).slice(-CAP)) {
          if (
            entry &&
            typeof entry === "object" &&
            entry.summary &&
            typeof entry.summary === "object"
          )
            entries[id] = entry as Entry;
        }
      }
    }
    return entries;
  } catch {
    return (entries ??= Object.create(null) as Record<string, Entry>);
  }
}

export function flushSummaryCache(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = undefined;
  try {
    if (entries)
      storage?.setItem(KEY, JSON.stringify({ version: VERSION, entries }));
  } catch {
    /* Cache failures must not prevent reading reports. */
  }
}

function scheduleFlush(): void {
  if (!flushTimer) flushTimer = setTimeout(flushSummaryCache, 100);
}

export function reconcileSummaryCache(sessions: readonly SessionMeta[]): void {
  const current = read();
  const ids = new Set(sessions.map((session) => session.id));
  revisions = new Map(
    sessions.map((session) => [session.id, session.sourceRevision]),
  );
  let changed = false;
  for (const id of Object.keys(current)) {
    if (!ids.has(id) || current[id].revision !== revisions.get(id)) {
      delete current[id];
      changed = true;
    }
  }
  if (changed) scheduleFlush();
}

export function getCachedSummary(id: string): SessionSummary | null {
  const entry = read()[id];
  if (entry && revisions.has(id) && entry.revision !== revisions.get(id))
    return null;
  return entry?.summary ?? null;
}

export function setCachedSummary(id: string, summary: SessionSummary): void {
  const current = read();
  delete current[id];
  current[id] = { summary, revision: revisions.get(id) };
  for (const old of Object.keys(current).slice(
    0,
    Math.max(0, Object.keys(current).length - CAP),
  ))
    delete current[old];
  scheduleFlush();
}

export function dropCachedSummary(id: string): void {
  const current = read();
  if (!(id in current)) return;
  delete current[id];
  scheduleFlush();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushSummaryCache);
  window.addEventListener("storage", (event) => {
    if (event.key !== KEY && event.key !== null) return;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = undefined;
    entries = undefined;
  });
}
