import type { I18n, MessageKey } from "./i18n";
import type { Alert, AlertKind } from "./types";

// Alert kinds are backend enum values, not display copy.
export const ALERT_KIND_META: Record<
  AlertKind,
  { emoji: string; verbKey: MessageKey; accent: string }
> = {
  follow: { emoji: "💜", verbKey: "chat.alerts.verb.follow", accent: "info" },
  sub: { emoji: "⭐", verbKey: "chat.alerts.verb.sub", accent: "brass" },
  resub: { emoji: "🔁", verbKey: "chat.alerts.verb.resub", accent: "brass" },
  subgift: {
    emoji: "🎁",
    verbKey: "chat.alerts.verb.subgift",
    accent: "tomato",
  },
  bits: { emoji: "💎", verbKey: "chat.alerts.verb.bits", accent: "brass" },
  tip: { emoji: "💰", verbKey: "chat.alerts.verb.tip", accent: "ok" },
  raid: { emoji: "🚀", verbKey: "chat.alerts.verb.raid", accent: "info" },
  member: { emoji: "🏅", verbKey: "chat.alerts.verb.member", accent: "ok" },
  superchat: {
    emoji: "💬",
    verbKey: "chat.alerts.verb.superchat",
    accent: "brass",
  },
  upgrade: {
    emoji: "⏫",
    verbKey: "chat.alerts.verb.upgrade",
    accent: "brass",
  },
  payforward: {
    emoji: "🤝",
    verbKey: "chat.alerts.verb.payforward",
    accent: "tomato",
  },
  streak: { emoji: "🔥", verbKey: "chat.alerts.verb.streak", accent: "info" },
  charity: { emoji: "💚", verbKey: "chat.alerts.verb.charity", accent: "ok" },
  gift: { emoji: "🎀", verbKey: "chat.alerts.verb.gift", accent: "tomato" },
  kicks: { emoji: "🟩", verbKey: "chat.alerts.verb.kicks", accent: "ok" },
  reward: { emoji: "🎟️", verbKey: "chat.alerts.verb.reward", accent: "info" },
  milestone: {
    emoji: "🏆",
    verbKey: "chat.alerts.verb.milestone",
    accent: "brass",
  },
};

const money = (a: AlertDetailInput) =>
  a.amount ? `${a.currency ? a.currency + " " : ""}${a.amount}` : "";

/** Platform-provided tier labels are displayed verbatim. */
export type AlertDetailInput = Pick<Alert, "kind"> &
  Partial<Pick<Alert, "amount" | "currency" | "tier" | "title" | "image">>;

export function alertDetail(
  a: AlertDetailInput,
  i18n: Pick<I18n, "t" | "tp">,
): string {
  const months = (n: number) => i18n.tp("chat.alerts.detail.months", n);
  switch (a.kind) {
    case "bits":
      return a.amount ? i18n.t("chat.alerts.detail.bits", { n: a.amount }) : "";
    case "resub":
      return [a.amount ? months(a.amount) : "", a.tier]
        .filter(Boolean)
        .join(" · ");
    case "sub":
      return a.tier ?? "";
    case "subgift":
      return i18n.tp("chat.alerts.detail.subs", a.amount ?? 1);
    case "raid":
      return a.amount
        ? i18n.t("chat.alerts.detail.raidViewers", { n: a.amount })
        : "";
    case "member":
      return [a.tier, a.amount && a.amount > 1 ? months(a.amount) : ""]
        .filter(Boolean)
        .join(" · ");
    case "superchat":
    case "tip":
    case "charity":
      // The platform's own amount text (localized) when it has one.
      return a.title && a.kind === "superchat" && !a.image ? a.title : money(a);
    case "gift":
      return a.currency === "JEWELS" && a.amount
        ? i18n.t("chat.alerts.detail.jewels", { n: a.amount })
        : "";
    case "kicks":
      return a.amount
        ? i18n.t("chat.alerts.detail.kicks", { n: a.amount })
        : "";
    case "streak":
      return a.amount ? i18n.tp("chat.alerts.detail.streak", a.amount) : "";
    case "milestone":
      return a.amount ? String(a.amount) : "";
    default:
      return "";
  }
}
