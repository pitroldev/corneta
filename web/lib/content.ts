// Fatos do produto que a página E os dados estruturados precisam.
//
// Vive num arquivo só de propósito: FAQ renderizada e FAQPage do schema.org
// saem daqui juntas, então é impossível o texto visível e o que o buscador lê
// divergirem — que é o jeito clássico de tomar penalidade por conteúdo
// inconsistente.
//
// Desde a tradução, tudo aqui é FUNÇÃO DO IDIOMA. O texto mora no dicionário
// (lib/i18n/pt.ts e en.ts); estas funções só dizem qual chave entra em que
// ordem — que é a parte que não muda de língua.
import type { MessageKey, T } from "./i18n";

/** Última revisão do conteúdo da home — alimenta o `lastModified` do sitemap.
 *  Atualize quando a copy mudar de verdade: data que mexe a cada build vira
 *  ruído e o buscador aprende a ignorar. */
export const CONTENT_UPDATED_ISO = "2026-07-31";

export type Faq = { question: string; answer: string };

/** Perguntas na ordem em que travam o download, não na ordem do produto. */
const FAQ_IDS = [
  "multistream_ban",
  "streamlabs_xsplit",
  "replaces_obs",
  // A objeção mais forte que existe hoje: há plugin grátis de multistream que
  // roda dentro do próprio OBS. Responder de frente — e admitir quando ele
  // basta — converte melhor do que fingir que não existe.
  "obs_plugin",
  "free",
  "performance",
  "upload",
  "vertical_tiktok",
  "overlay",
  "platforms",
  "macos_linux",
] as const;

export const faqsFor = (t: T): Faq[] =>
  FAQ_IDS.map((id) => ({
    question: t(`content.faq.${id}.question` as MessageKey),
    answer: t(`content.faq.${id}.answer` as MessageKey),
  }));

export type Step = { title: string; text: string };

export const stepsFor = (t: T): Step[] =>
  ([1, 2, 3] as const).map((n) => ({
    title: t(`content.steps.${n}.title` as MessageKey),
    text: t(`content.steps.${n}.text` as MessageKey),
  }));

/** Uma frase por recurso — vira `featureList` do schema e resposta citável. */
const FEATURE_IDS = [
  "multistream",
  "independent_connections",
  "quality_modes",
  "load_estimate",
  "vertical_crop",
  "unified_chat",
  "alerts",
  "overlay",
  "brb_screen",
  "privacy_guard",
  "auto_bitrate",
  "post_live_report",
  "report_per_channel",
  "keys_in_vault",
] as const;

export const featuresFor = (t: T): string[] =>
  FEATURE_IDS.map((id) => t(`content.features.${id}` as MessageKey));

/** O que cada login oficial pede e por quê.
 *
 *  Existe por dois motivos: o streamer merece saber o que está autorizando, e a
 *  verificação de marca do Google exige que a home explique o uso dos dados do
 *  usuário. Os escopos são os mesmos do código (src-tauri/src/auth.rs) — se
 *  mudarem lá, mudam aqui. */
const SCOPE_IDS = ["youtube", "twitch", "kick"] as const;

export const accountScopesFor = (t: T) =>
  SCOPE_IDS.map((platform) => ({
    platform,
    title: t(`content.scopes.${platform}.title` as MessageKey),
    permission: t(`content.scopes.${platform}.permission` as MessageKey),
    why: t(`content.scopes.${platform}.why` as MessageKey),
    never: t(`content.scopes.${platform}.never` as MessageKey),
  }));

/** Frase única e citável: é o que motor generativo tende a extrair.
 *
 *  Carrega o diferencial, não só o mecanismo: o multistream sozinho descreve
 *  também a concorrência, e uma frase que serve pro concorrente não posiciona
 *  ninguém. */
export const oneLinerFor = (t: T): string => t("content.one_liner");
