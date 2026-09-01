// Cache em localStorage (adapter de I/O) do resumo de sessão, keyed por session id — evita
// reparsear NDJSON grande toda vez que a lista abre. Extraído do report.ts pra ele ficar 100%
// puro. Entrada órfã de sessão excluída é inofensiva.
import type { SessionSummary } from "./types";

const SUMMARY_CACHE_KEY = "corneta.session-summaries";
// A versão representa a heurística que produz `SessionSummary`, não o formato
// do NDJSON. Subir este número descarta contagens antigas sem tocar nas sessões.
const SUMMARY_CACHE_VERSION = 2;

interface SummaryCacheEnvelope {
  version: number;
  summaries: Record<string, SessionSummary>;
}

function readSummaryCache(): Record<string, SessionSummary> {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(SUMMARY_CACHE_KEY) ?? "null",
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as Partial<SummaryCacheEnvelope>).version !==
        SUMMARY_CACHE_VERSION ||
      typeof (parsed as Partial<SummaryCacheEnvelope>).summaries !== "object" ||
      (parsed as Partial<SummaryCacheEnvelope>).summaries === null
    )
      return {};
    return (parsed as SummaryCacheEnvelope).summaries;
  } catch {
    return {};
  }
}

function writeSummaryCache(summaries: Record<string, SessionSummary>): void {
  localStorage.setItem(
    SUMMARY_CACHE_KEY,
    JSON.stringify({ version: SUMMARY_CACHE_VERSION, summaries }),
  );
}

export function getCachedSummary(id: string): SessionSummary | null {
  return readSummaryCache()[id] ?? null;
}

export function setCachedSummary(id: string, s: SessionSummary): void {
  try {
    const all = readSummaryCache();
    all[id] = s;
    writeSummaryCache(all);
  } catch {
    // localStorage indisponível/cheio — segue sem cache
  }
}

export function dropCachedSummary(id: string): void {
  try {
    const all = readSummaryCache();
    if (!(id in all)) return;
    delete all[id];
    writeSummaryCache(all);
  } catch {
    // sem cache, sem drama
  }
}
