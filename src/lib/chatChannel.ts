import type { ChatPlatform } from "./types";

/**
 * Normaliza o que o streamer COLOU no campo de canal do chat pro formato que cada backend
 * espera — cobrindo as cagadas comuns: URL inteira, @, #, query de tracking (?si=…), subpáginas
 * (/videos, /chat), popout, VOD/clipe, host mobile (m.), acento no nome, maiúsculas, espaços.
 * Idempotente. Entrada sem canal recuperável (home do site, playlist, clipe) → "".
 *
 * - Twitch: login puro em minúsculas; rejeita rotas reservadas (/videos, /directory, clipe…).
 * - Kick:   slug puro em minúsculas.
 * - YouTube: preserva VÍDEO × CANAL — vídeo vira o ID; canal vira `@handle`, `UC…`, ou
 *   `youtube.com/c|user/<nome>`; um token solto vira `@handle` (é campo de "canal").
 */
export function normalizeChatChannel(platform: ChatPlatform, raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  switch (platform) {
    case "twitch":
      return normTwitch(s);
    case "kick":
      return normKick(s);
    case "youtube":
      return normYouTube(s);
    default:
      return s;
  }
}

/** Se `s` contém um dos hosts, devolve o que vem DEPOIS dele; senão devolve `s` intacto. */
function afterHost(s: string, needles: string[]): string {
  const low = s.toLowerCase();
  for (const n of needles) {
    const i = low.indexOf(n);
    if (i >= 0) return s.slice(i + n.length);
  }
  return s;
}

/** Primeiro segmento do caminho (corta em / ? #), sem @ na frente. */
function firstSeg(path: string): string {
  return (path.split(/[/?#]/).find((x) => x.length > 0) ?? "").replace(/^@+/, "");
}

/** Dobra acento pro ASCII base (ã→a, é→e) antes de descartar o resto — senão o login fica furado. */
function foldAscii(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// ------------------------------- Twitch -------------------------------

// Prefixos de URL cujo canal vem no segmento SEGUINTE (popout/<canal>/chat, moderator/<canal>…).
const TWITCH_SKIP = new Set(["popout", "moderator", "mod", "u", "embed"]);
// Rotas da Twitch que NÃO são canais — nenhum login pode ter esses nomes (são reservados).
const TWITCH_RESERVED = new Set([
  "videos", "video", "directory", "team", "collections", "clips", "clip", "settings",
  "prime", "turbo", "downloads", "store", "jobs", "p", "subscriptions", "following",
  "friends", "wallet", "drops", "bits", "search",
]);

function normTwitch(s: string): string {
  const low = s.toLowerCase();
  // clips.twitch.tv/<slug> não carrega o canal — não dá pra recuperar.
  if (low.includes("clips.twitch.tv")) return "";
  // player.twitch.tv/?channel=<canal> (embed) — o canal está na query.
  const chParam = s.match(/[?&]channel=([A-Za-z0-9_]+)/i);
  if (chParam) return chParam[1].toLowerCase();

  const path = afterHost(s, ["twitch.tv/"]).replace(/^[@#\s]+/, "");
  const segs = path.split(/[/?#]/).filter((x) => x.length > 0);
  let seg = segs[0] ?? "";
  if (TWITCH_SKIP.has(seg.toLowerCase()) && segs[1]) seg = segs[1];
  if (TWITCH_RESERVED.has(seg.toLowerCase())) return "";
  // login da Twitch: só [a-z0-9_], minúsculo (acento vira base ASCII antes do corte).
  return foldAscii(seg).replace(/^@+/, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
}

// -------------------------------- Kick --------------------------------

function normKick(s: string): string {
  // Tira protocolo e o host kick.com (com www./m., com ou sem barra) — home sem canal → "".
  let t = s.replace(/^https?:\/\//i, "");
  if (/^(www\.|m\.)?kick\.com(\/|$)/i.test(t)) {
    t = t.replace(/^(www\.|m\.)?kick\.com\/?/i, "");
  }
  t = t.replace(/^@+/, "");
  const seg = firstSeg(t);
  // slug da Kick: [a-z0-9_], minúsculo (acento → base ASCII).
  return foldAscii(seg).toLowerCase().replace(/[^a-z0-9_]/g, "");
}

// ------------------------------- YouTube ------------------------------

/** ID de VÍDEO (11 chars) quando a entrada é uma URL de vídeo; null se não for vídeo. */
function youtubeVideoId(s: string): string | null {
  const byV = s.match(/[?&]v=([0-9A-Za-z_-]{11})/);
  if (byV) return byV[1];
  // youtu.be/ID, /shorts/ID, /embed/ID, /live/ID (live específica), /video/ID (Studio).
  const byPath = s.match(
    /(?:youtu\.be\/|\/shorts\/|\/embed\/|\/live\/|\/video\/)([0-9A-Za-z_-]{11})(?![0-9A-Za-z_-])/,
  );
  if (byPath) {
    // "embed/live_stream" tem 11 chars mas NÃO é vídeo — é canal na query (tratado adiante).
    if (byPath[1].toLowerCase() === "live_stream") return null;
    return byPath[1];
  }
  return null;
}

function normYouTube(s: string): string {
  // 1) Vídeo (URL) → ID puro. (watch?v=… com list= também cai aqui, corretamente.)
  const vid = youtubeVideoId(s);
  if (vid) return vid;

  // 2) Playlist (sem vídeo) → não é canal.
  if (/[?&]list=/i.test(s) || /\/playlist\b/i.test(s)) return "";

  // 3) canal na query do embed/live_stream (?channel=UC…) ou UC solto numa URL.
  const chParam = s.match(/[?&]channel=(UC[0-9A-Za-z_-]{22})/i);
  if (chParam) return chParam[1];

  // 4) URL de canal — token que o resolver entende, sem query.
  const chan = s.match(/\/channel\/(UC[0-9A-Za-z_-]{22})/);
  if (chan) return chan[1];
  const at = s.match(/\/@([^/?#\s]+)/);
  if (at) return "@" + at[1];
  const cUser = s.match(/\/(c|user)\/([^/?#\s]+)/i);
  if (cUser) return `youtube.com/${cUser[1].toLowerCase()}/${cUser[2]}`;

  // 5) Token cru: tira protocolo/host (qualquer *.youtube.com ou youtu.be)/caminho/query.
  const stripped = s
    .replace(/^https?:\/\//i, "")
    .replace(/^[^/]*\.youtube\.com\//i, "")
    .replace(/^youtube\.com\//i, "")
    .replace(/^youtu\.be\//i, "")
    .trim();
  const hadAt = stripped.startsWith("@");
  const t = firstSeg(stripped); // corta em / ? # e tira @ inicial
  if (!t) return "";
  if (/^UC[0-9A-Za-z_-]{22}$/.test(t)) return t; // channel id cru
  if (hadAt) return "@" + t; // handle explícito (o streamer pôs o @)
  // Bare com CARA de ID de vídeo (11 chars) é ambíguo: mantém como está (o backend lê como
  // vídeo) — assim a extração de URL de vídeo continua idempotente. Pra usar como canal, ponha
  // o @. Qualquer outro token solto num campo de "canal" é handle → prefixa @.
  if (/^[0-9A-Za-z_-]{11}$/.test(t)) return t;
  return "@" + t;
}
