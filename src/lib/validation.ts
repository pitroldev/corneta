import type { I18n, MessageKey } from "./i18n";
import type { Target } from "./types";

/** URL de ingestão aceita (RTMP/RTMPS) — exige host após o esquema. */
export const INGEST_URL_RE = /^rtmps?:\/\/\S+/i;
/** Só o esquema, sem host (ex.: "rtmp://") — preset incompleto, tratar como vazio. */
const BARE_SCHEME_RE = /^rtmps?:\/\/$/i;

/** Problema de configuração de um destino, em CÓDIGO.
 *
 *  O filtro do "nome vazio é só aviso" comparava a frase em português — o que
 *  significa que traduzir a frase travaria o BORA em silêncio. Agora a decisão
 *  é por código; o texto é só a ponta que a tela mostra. */
export type TargetIssue = "noName" | "noUrl" | "badUrl" | "noKey";

const ISSUE_KEYS: Record<TargetIssue, MessageKey> = {
  noName: "core.target.issue.noName",
  noUrl: "core.target.issue.noUrl",
  badUrl: "core.target.issue.badUrl",
  noKey: "core.target.issue.noKey",
};

/** Problemas de configuração de um destino (lista vazia = ok). */
export function targetIssueCodes(target: Target): TargetIssue[] {
  const issues: TargetIssue[] = [];
  if (!target.name.trim()) issues.push("noName");
  const url = target.ingestUrl.trim();
  if (!url || BARE_SCHEME_RE.test(url)) issues.push("noUrl");
  else if (!INGEST_URL_RE.test(url)) issues.push("badUrl");
  if (target.enabled && !target.hasKey) issues.push("noKey");
  return issues;
}

/** Problemas que IMPEDEM iniciar (chave/URL). Nome vazio é só aviso. */
export function blockingIssueCodes(target: Target): TargetIssue[] {
  return targetIssueCodes(target).filter((i) => i !== "noName");
}

/** Texto de um problema no idioma ativo (item de lista, por isso minúsculo). */
export const issueText = (issue: TargetIssue, t: I18n["t"]): string =>
  t(ISSUE_KEYS[issue]);

/** Problemas de configuração já escritos pra tela. Só conta quantos? Use
 *  `targetIssueCodes` e economize o `t`. */
export function targetIssues(target: Target, t: I18n["t"]): string[] {
  return targetIssueCodes(target).map((i) => issueText(i, t));
}

/** Problemas que impedem iniciar, já escritos pra tela. */
export function blockingIssues(target: Target, t: I18n["t"]): string[] {
  return blockingIssueCodes(target).map((i) => issueText(i, t));
}

/** True se a URL foi digitada e está num formato inválido (pra marcar o campo). */
export function isUrlInvalid(t: Target): boolean {
  const url = t.ingestUrl.trim();
  return (
    url.length > 0 && !BARE_SCHEME_RE.test(url) && !INGEST_URL_RE.test(url)
  );
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

/** Tira aspas/apóstrofos que envolvem o valor inteiro (colagem de "…" ou '…'). */
function stripWrappingQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && /^["'`]/.test(t) && t.endsWith(t[0]))
    return t.slice(1, -1).trim();
  return t;
}

/**
 * Limpa a chave da API do YouTube (Data API v3). O streamer às vezes cola a URL do console do
 * Google, um `key=…`, ou a chave entre aspas / com espaço no fim. A chave tem forma fixa
 * (`AIza` + 35 chars), então extraímos ela de dentro de qualquer sujeira. Sem match, cai pro
 * trim + tira aspas + remove espaços/quebras (a chave nunca tem espaço).
 *
 *   "AIzaSyABC…"                         → "AIzaSyABC…"
 *   "key=AIzaSyABC…&foo"                 → "AIzaSyABC…"
 *   "https://console.cloud…?key=AIza…"   → "AIza…"
 *   ' "AIza…" '                          → "AIza…"
 */
export function sanitizeApiKey(raw: string): string {
  const m = raw.match(/AIza[0-9A-Za-z_-]{35}/);
  if (m) return m[0];
  return stripWrappingQuotes(raw).replace(/\s+/g, "");
}

/**
 * Limpa um TOKEN opaco colado (Socket API do Streamlabs, JWT do StreamElements, Client
 * ID/Secret do OAuth). Não têm forma fixa, então limpamos o que cerca: aspas, `Bearer `,
 * rótulo `token:`/`jwt:`/`token=` (inclui URL de socket `…?token=xxx`) e qualquer espaço
 * interno (nenhum desses tokens tem espaço). Sem rótulo, é só o token trimado e sem aspas.
 *
 *   "Bearer eyJhbGciOi…"                       → "eyJhbGciOi…"
 *   '"abc123"'                                 → "abc123"
 *   "Your Socket API Token: abc123"            → "abc123"
 *   "https://sockets.streamlabs.com/?token=ab" → "ab"
 */
export function sanitizeToken(raw: string): string {
  let t = stripWrappingQuotes(raw)
    .replace(/^bearer\s+/i, "")
    .trim();
  // Rótulo/lista tipo "token: xxx", "jwt = xxx", ou querystring "?token=xxx".
  const labelled = t.match(/(?:token|jwt)\s*[:=]\s*([^\s&"']+)/i);
  if (labelled) t = labelled[1];
  return t.replace(/\s+/g, "");
}

/** Só o esquema+host+porta+caminho, sem espaços nem aspas (URL não tem espaço no meio). */
export function sanitizeIngestUrl(raw: string): string {
  const t = stripWrappingQuotes(raw).replace(/\s+/g, "");
  return BARE_SCHEME_RE.test(t) ? "" : t;
}

/**
 * Limpa o HOST de ingestão (avançado). Se o streamer colar a URL inteira no campo de host
 * (`rtmp://localhost:1935/live`) ou `host:porta`, ficamos só com o host — a porta e o app
 * têm campos próprios.
 *
 *   "localhost"                    → "localhost"
 *   "rtmp://localhost:1935/live"   → "localhost"
 *   "127.0.0.1:1935"               → "127.0.0.1"
 */
export function sanitizeHost(raw: string): string {
  let t = stripWrappingQuotes(raw).replace(/\s+/g, "");
  t = t.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ""); // tira esquema (rtmp://, srt://, http://…)
  t = t.split(/[/?#]/)[0]; // corta caminho/query
  t = t.replace(/:\d+$/, ""); // corta a porta
  return t;
}
