// Cache em localStorage (adapter de I/O) do resumo de sessão, keyed por session id — evita
// reparsear NDJSON grande toda vez que a lista abre. Extraído do report.ts pra ele ficar 100%
// puro. Entrada órfã de sessão excluída é inofensiva.
import type { SessionSummary } from "./types";

const SUMMARY_CACHE_KEY = "corneta.session-summaries";

function readSummaryCache(): Record<string, SessionSummary> {
  try {
    return JSON.parse(localStorage.getItem(SUMMARY_CACHE_KEY) ?? "{}") as Record<string, SessionSummary>;
  } catch {
    return {};
  }
}

export function getCachedSummary(id: string): SessionSummary | null {
  return readSummaryCache()[id] ?? null;
}

export function setCachedSummary(id: string, s: SessionSummary): void {
  try {
    const all = readSummaryCache();
    all[id] = s;
    localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(all));
  } catch {
    // localStorage indisponível/cheio — segue sem cache
  }
}

export function dropCachedSummary(id: string): void {
  try {
    const all = readSummaryCache();
    if (!(id in all)) return;
    delete all[id];
    localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(all));
  } catch {
    // sem cache, sem drama
  }
}
