// Share localized facts between visible content and structured data.
import type { MessageKey, T } from "./i18n";

// Content revision date, not build time; used by sitemap lastModified.
export const CONTENT_UPDATED_ISO = "2026-10-21";

export type Faq = { question: string; answer: string };

const FAQ_IDS = [
  "multistream_ban",
  "streamlabs_xsplit",
  "replaces_obs",
  "obs_plugin",
  "free",
  "performance",
  "upload",
  "macos_linux",
] as const;

export const faqsFor = (t: T): Faq[] =>
  FAQ_IDS.map((id) => ({
    question: t(`content.faq.${id}.question` as MessageKey),
    answer: t(`content.faq.${id}.answer` as MessageKey),
  }));

export type Step = { title: string; text: string };

export const stepsFor = (t: T): Step[] =>
  ([1, 2, 3, 4] as const).map((n) => ({
    title: t(`content.steps.${n}.title` as MessageKey),
    text: t(`content.steps.${n}.text` as MessageKey),
  }));

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

export const oneLinerFor = (t: T): string => t("content.one_liner");
