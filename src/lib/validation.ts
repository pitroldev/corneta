import type { Target } from "./types";

/** URL de ingestão aceita (rtmp/rtmps/srt). */
export const INGEST_URL_RE = /^(rtmps?|srt):\/\/\S+/i;

/** Problemas de configuração de um destino (lista vazia = ok). */
export function targetIssues(t: Target): string[] {
  const issues: string[] = [];
  if (!t.name.trim()) issues.push("nome vazio");
  if (t.platformId === "custom") {
    const url = t.ingestUrl.trim();
    if (!url) issues.push("URL não definida");
    else if (!INGEST_URL_RE.test(url)) issues.push("URL inválida (use rtmp://, rtmps:// ou srt://)");
  }
  if (t.enabled && !t.hasKey) issues.push("sem chave");
  return issues;
}

/** Problemas que IMPEDEM iniciar (chave/URL). Nome vazio é só aviso. */
export function blockingIssues(t: Target): string[] {
  return targetIssues(t).filter((i) => i !== "nome vazio");
}

/** True se a URL custom foi digitada e está num formato inválido. */
export function isCustomUrlInvalid(t: Target): boolean {
  if (t.platformId !== "custom") return false;
  const url = t.ingestUrl.trim();
  return url.length > 0 && !INGEST_URL_RE.test(url);
}
