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
  else if (!INGEST_URL_RE.test(url)) issues.push("URL inválida — use rtmp://, rtmps:// ou srt://");
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

/**
 * Limpa o que o streamer colou no campo de "chave de stream".
 *
 * Às vezes a pessoa cola a URL COMPLETA (servidor + chave), em vez de só a
 * chave/token. Aqui extraímos apenas a chave e sinalizamos pra UI
 * (`strippedUrl`) poder avisar que a Corneta detectou e cortou a URL.
 *
 * Regras:
 * - Trim sempre.
 * - Se `ingestUrl` foi passada e o valor começa exatamente com ela (+ "/"),
 *   removemos esse prefixo — recorte exato, é o caso mais confiável.
 * - Senão, se o valor tem "://" (colou uma URL), pegamos tudo depois do último
 *   "/" do caminho, PRESERVANDO a querystring (a Twitch às vezes anexa
 *   `?bandwidthtest=true` na chave).
 * - Se não tem "://", é uma chave comum — devolve o próprio valor trimado.
 * - Nunca "come" a chave: se o recorte ficar vazio, devolve o raw trimado.
 *
 * Exemplos (antes → depois):
 *   sanitizeStreamKey("live_123")                                   → "live_123"                 (chave pura, strippedUrl=false)
 *   sanitizeStreamKey("  live_123  ")                               → "live_123"                 (espaços aparados)
 *   sanitizeStreamKey("rtmp://live.twitch.tv/app/live_123",
 *                     "rtmp://live.twitch.tv/app")                  → "live_123"                 (recorte exato do prefixo)
 *   sanitizeStreamKey("rtmp://live.twitch.tv/app/live_123")         → "live_123"                 (fallback: último "/")
 *   sanitizeStreamKey("rtmps://x.live-video.net/app/sk_abc")        → "sk_abc"                   (Kick)
 *   sanitizeStreamKey("rtmp://live.twitch.tv/app/live_9?bwtest=true") → "live_9?bwtest=true"     (querystring preservada)
 */
export function sanitizeStreamKey(
  raw: string,
  ingestUrl?: string,
): { key: string; strippedUrl: boolean } {
  const trimmed = raw.trim();

  // 1) Recorte exato: valor começa com o servidor de ingestão conhecido.
  const base = ingestUrl?.trim().replace(/\/+$/, "");
  if (base && trimmed.startsWith(base + "/")) {
    const key = trimmed.slice(base.length).replace(/^\/+/, "");
    if (key) return { key, strippedUrl: true };
  }

  // 2) Colou uma URL inteira (tem esquema): fica só o que vem após o último
  //    "/" do caminho — mas separamos a querystring antes pra não perdê-la.
  if (trimmed.includes("://")) {
    const q = trimmed.indexOf("?");
    const path = q === -1 ? trimmed : trimmed.slice(0, q);
    const query = q === -1 ? "" : trimmed.slice(q); // inclui o "?"
    const key = path.slice(path.lastIndexOf("/") + 1) + query;
    if (key) return { key, strippedUrl: true };
  }

  // 3) Chave comum (ou recorte vazio): não mexe.
  return { key: trimmed, strippedUrl: false };
}
