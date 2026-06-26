import type { Target } from "./types";

/** URL de ingestão aceita (rtmp/rtmps/srt) — exige host após o esquema. */
export const INGEST_URL_RE = /^(rtmps?|srt):\/\/\S+/i;
/** Só o esquema, sem host (ex.: "rtmp://") — preset incompleto, tratar como vazio. */
const BARE_SCHEME_RE = /^(rtmps?|srt):\/\/$/i;

/** Problemas de configuração de um destino (lista vazia = ok). */
export function targetIssues(t: Target): string[] {
  const issues: string[] = [];
  if (!t.name.trim()) issues.push("nome vazio");
  const url = t.ingestUrl.trim();
  if (!url || BARE_SCHEME_RE.test(url)) issues.push("URL não definida");
  else if (!INGEST_URL_RE.test(url)) issues.push("URL inválida (use rtmp://, rtmps:// ou srt://)");
  if (t.enabled && !t.hasKey) issues.push("sem chave");
  return issues;
}

/** Problemas que IMPEDEM iniciar (chave/URL). Nome vazio é só aviso. */
export function blockingIssues(t: Target): string[] {
  return targetIssues(t).filter((i) => i !== "nome vazio");
}

/** True se a URL foi digitada e está num formato inválido (pra marcar o campo). */
export function isUrlInvalid(t: Target): boolean {
  const url = t.ingestUrl.trim();
  return url.length > 0 && !BARE_SCHEME_RE.test(url) && !INGEST_URL_RE.test(url);
}

/** True se o destino tem uma URL de ingestão válida (host presente). */
export function hasValidUrl(t: Target): boolean {
  return INGEST_URL_RE.test(t.ingestUrl.trim());
}
