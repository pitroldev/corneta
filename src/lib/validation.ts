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
 * - Se o valor é SÓ a URL do servidor (a própria `ingestUrl` conhecida, um
 *   prefixo dela, ou uma URL cujo último segmento é o mesmo "app" da base —
 *   ex.: ingest regional da Twitch), NÃO há chave ali: devolvemos key vazia
 *   com `strippedUrl=true` pra UI recusar, em vez de salvar "app" como chave.
 * - Se `ingestUrl` foi passada e o valor começa exatamente com ela (+ "/"),
 *   removemos esse prefixo — recorte exato, é o caso mais confiável.
 * - Senão, se o valor tem "://" (colou uma URL), pegamos tudo depois do último
 *   "/" do caminho, PRESERVANDO a querystring (a Twitch às vezes anexa
 *   `?bandwidthtest=true` na chave).
 * - Se não tem "://", é uma chave comum — devolve o próprio valor trimado.
 * - Fora o caso "só a URL do servidor", nunca "come" a chave: se o recorte
 *   ficar vazio, devolve o raw trimado.
 *
 * Exemplos (antes → depois):
 *   sanitizeStreamKey("live_123")                                   → "live_123"                 (chave pura, strippedUrl=false)
 *   sanitizeStreamKey("  live_123  ")                               → "live_123"                 (espaços aparados)
 *   sanitizeStreamKey("rtmp://live.twitch.tv/app/live_123",
 *                     "rtmp://live.twitch.tv/app")                  → "live_123"                 (recorte exato do prefixo)
 *   sanitizeStreamKey("rtmp://live.twitch.tv/app/live_123")         → "live_123"                 (fallback: último "/")
 *   sanitizeStreamKey("rtmps://x.live-video.net/app/sk_abc")        → "sk_abc"                   (Kick)
 *   sanitizeStreamKey("rtmp://live.twitch.tv/app/live_9?bwtest=true") → "live_9?bwtest=true"     (querystring preservada)
 *   sanitizeStreamKey("rtmp://live.twitch.tv/app",
 *                     "rtmp://live.twitch.tv/app")                  → ""                         (só o servidor: sem chave, strippedUrl=true)
 */
export function sanitizeStreamKey(
  raw: string,
  ingestUrl?: string,
): { key: string; strippedUrl: boolean } {
  const trimmed = raw.trim();

  const base = ingestUrl?.trim().replace(/\/+$/, "");
  // Base só vale como referência se tem host (presets "rtmp://" ficam de fora).
  const hasBase = !!base && base.includes("://");

  // 0) Colou SÓ a URL do servidor (sem chave): o valor é a própria base (ou um
  //    prefixo dela, ex.: sem o "/app" final), ou uma URL cujo último segmento
  //    do caminho é o mesmo "app" da base (ingest regional). Não tem chave aqui.
  if (hasBase && trimmed.includes("://") && !trimmed.includes("?")) {
    const noSlash = trimmed.replace(/\/+$/, "").toLowerCase();
    const baseLower = base.toLowerCase();
    const isPrefixOfBase =
      baseLower === noSlash || baseLower.startsWith(noSlash + "/");
    // Último segmento do CAMINHO (vazio se a URL não tem caminho após o host).
    const lastPathSeg = (u: string) => {
      const rest = u.slice(u.indexOf("://") + 3);
      const s = rest.indexOf("/");
      return s === -1 ? "" : rest.slice(rest.lastIndexOf("/") + 1);
    };
    const baseApp = lastPathSeg(baseLower);
    const sameApp = baseApp !== "" && lastPathSeg(noSlash) === baseApp;
    if (isPrefixOfBase || sameApp) return { key: "", strippedUrl: true };
  }

  // 1) Recorte exato: valor começa com o servidor de ingestão conhecido.
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
