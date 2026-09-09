import type { I18n } from "./i18n";
import type { ViewerItem, Viewers } from "./types";

type AudienceMetadata = Pick<ViewerItem, "audienceStatus" | "audienceOrigin">;
type AudienceI18n = Pick<I18n, "t" | "fmt">;

const ORIGIN_NAMES = { twitch: "Twitch", youtube: "YouTube", kick: "Kick" };

const hasUnknownCinefy = (items: readonly ViewerItem[]) =>
  items.some(
    (item) =>
      item.platform === "cinefy" &&
      !item.audienceOrigin &&
      (item.audienceStatus === "unavailable" ||
        (item.audienceStatus === "live" && item.viewers === null)),
  );

export function audienceStatusText(
  item: AudienceMetadata,
  t: I18n["t"],
): string {
  if (item.audienceStatus === "embedded") {
    const origin = item.audienceOrigin;
    return origin && origin !== "external"
      ? t("audience.embedded", { platform: ORIGIN_NAMES[origin] })
      : t("audience.embedded.unknown");
  }
  if (item.audienceStatus === "offline") return t("audience.offline");
  if (item.audienceStatus === "live") return t("audience.live");
  return t("audience.unavailable");
}

export function embeddedAudienceText(
  item: AudienceMetadata & { embeddedViewers?: number },
  { t, fmt }: AudienceI18n,
): string | null {
  if (
    item.audienceStatus !== "embedded" ||
    item.embeddedViewers === undefined ||
    !Number.isSafeInteger(item.embeddedViewers) ||
    item.embeddedViewers < 0
  )
    return null;
  const origin = item.audienceOrigin;
  return t("audience.embeddedCount", {
    platform:
      origin && origin !== "external"
        ? ORIGIN_NAMES[origin]
        : t("audience.external"),
    n: fmt.num(item.embeddedViewers),
  });
}

export function showAudience(viewers: Viewers): boolean {
  return (
    viewers.total > 0 ||
    viewers.anyLive ||
    viewers.items.some(
      (item) => item.platform === "cinefy" && item.audienceStatus !== undefined,
    )
  );
}

export function audienceTotal(viewers: Viewers, fmt: I18n["fmt"]): string {
  const known = viewers.items.some(
    (item) =>
      item.audienceStatus !== "embedded" &&
      item.audienceStatus !== "unavailable" &&
      item.viewers !== null &&
      Number.isSafeInteger(item.viewers) &&
      item.viewers >= 0,
  );
  if (!known && viewers.total <= 0) return "—";
  const total = fmt.num(viewers.total);
  return hasUnknownCinefy(viewers.items) ? `≥ ${total}` : total;
}

export function audienceTooltip(
  items: readonly ViewerItem[],
  { t, fmt }: AudienceI18n,
): string {
  const rows = items
    .filter((item) => item.live || item.audienceStatus)
    .map((item) => {
      if (
        item.audienceStatus === "embedded" ||
        item.audienceStatus === "unavailable"
      ) {
        return `${item.source}: ${embeddedAudienceText(item, { t, fmt }) ?? audienceStatusText(item, t)}`;
      }
      if (item.viewers === null)
        return `${item.source}: ${t("audience.unavailable")}`;
      return t("chat.viewers.tooltip.row", {
        source: item.source,
        n: fmt.num(item.viewers),
      });
    })
    .join("\n");
  return hasUnknownCinefy(items) ? `${t("audience.partial")}\n${rows}` : rows;
}

export function audienceStartedAt(
  value: string | undefined,
  { t, fmt }: AudienceI18n,
): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return t("audience.startedAt", {
    date: fmt.date(timestamp),
    time: fmt.time(timestamp),
  });
}
