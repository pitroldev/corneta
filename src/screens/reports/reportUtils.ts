import { PLATFORMS } from "../../lib/platforms";
import type { ChannelStats, ReportAnalysis } from "../../lib/report";
import type { SessionData, SessionSummary } from "../../lib/types";
import type { Fmt, I18n, MessageKey } from "../../lib/i18n";

export const MODE_KEY: Record<string, MessageKey> = {
  "per-platform": "reports.mode.perPlatform",
  passthrough: "reports.mode.passthrough",
  hybrid: "reports.mode.hybrid",
};

export const platformColor = (platformId: string): string =>
  PLATFORMS[platformId as keyof typeof PLATFORMS]?.color ?? "#ffb323";

function lighten(hex: string, amount: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match || amount <= 0) return hex;
  const value = parseInt(match[1], 16);
  return `#${[(value >> 16) & 255, (value >> 8) & 255, value & 255]
    .map((channel) =>
      Math.round(channel + (255 - channel) * Math.min(amount, 0.75))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function channelColors(
  channels: ChannelStats[],
): Record<string, string> {
  const occurrence: Record<string, number> = {};
  const colors: Record<string, string> = {};
  for (const channel of channels) {
    const index = occurrence[channel.platform] ?? 0;
    occurrence[channel.platform] = index + 1;
    colors[channel.key] = lighten(platformColor(channel.platform), index * 0.3);
  }
  return colors;
}

export function relativeTime(startedAt: number, timestamp: number): string {
  const seconds = Math.max(0, Math.round((timestamp - startedAt) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return hours > 0
    ? `${hours}:${minutes}:${remainder}`
    : `${minutes}:${remainder}`;
}

export interface HeroStat {
  label: string;
  value: string;
  accent?: boolean;
  sub?: { text: string; tone: "up" | "neutral" };
}

export interface LivePortrait {
  title: string;
  detail: string;
}

export function buildLivePortrait(
  data: SessionData,
  analysis: ReportAnalysis,
  { t, tp, fmt }: Pick<I18n, "t" | "tp" | "fmt">,
): LivePortrait {
  const duration = fmt.dur(data.meta.durationSec);

  if (analysis.viewers.hasData) {
    const title = tp(
      "reports.story.portrait.title.viewers",
      analysis.viewers.peak,
      { peak: fmt.num(analysis.viewers.peak) },
    );
    return {
      title,
      detail: analysis.chat.hasData
        ? t("reports.story.portrait.detail.viewersChat", {
            duration,
            avg: fmt.num(analysis.viewers.avg),
            messages: fmt.num(analysis.chat.total),
          })
        : t("reports.story.portrait.detail.viewers", {
            duration,
            avg: fmt.num(analysis.viewers.avg),
          }),
    };
  }

  if (analysis.chat.hasData) {
    return {
      title: tp("reports.story.portrait.title.chat", analysis.chat.total, {
        messages: fmt.num(analysis.chat.total),
      }),
      detail: t("reports.story.portrait.detail.chat", { duration }),
    };
  }

  return {
    title: t("reports.story.portrait.title.duration", { duration }),
    detail: t("reports.story.portrait.detail.duration", {
      channels: data.meta.platforms.map((platform) => platform.name).join(", "),
    }),
  };
}

function delta(
  current: number,
  previous: number | null | undefined,
  t: I18n["t"],
): HeroStat["sub"] {
  if (previous == null || previous <= 0) return undefined;
  const percentage = Math.round(((current - previous) / previous) * 100);
  if (percentage === 0)
    return { text: t("reports.delta.same"), tone: "neutral" };
  return {
    text: t("reports.delta.pct", {
      pct: `${percentage > 0 ? "+" : ""}${percentage}`,
    }),
    tone: percentage > 0 ? "up" : "neutral",
  };
}

export function buildHeroStats(
  analysis: ReportAnalysis,
  previous: SessionSummary | null,
  t: I18n["t"],
  fmt: Fmt,
): HeroStat[] {
  const stats: HeroStat[] = [];
  if (analysis.viewers.hasData) {
    stats.push({
      label: t("reports.stat.peakViewers"),
      value: fmt.num(analysis.viewers.peak),
      accent: true,
      sub: delta(analysis.viewers.peak, previous?.peakViewers, t),
    });
    stats.push({
      label: t("reports.stat.avg"),
      value: fmt.num(analysis.viewers.avg),
      sub: delta(analysis.viewers.avg, previous?.avgViewers, t),
    });
  }

  const followers = analysis.byChannel.followersGained;
  if (followers != null && followers !== 0) {
    stats.push({
      label: t(
        analysis.byChannel.followersNet
          ? "reports.stat.followersNet"
          : "reports.stat.newFollowers",
      ),
      value: `${followers > 0 ? "+" : ""}${fmt.num(followers)}`,
    });
  }
  if (analysis.alerts.subs > 0)
    stats.push({
      label: t("reports.stat.subs"),
      value: String(analysis.alerts.subs),
    });
  if (analysis.alerts.bits > 0)
    stats.push({
      label: t("reports.stat.bits"),
      value: fmt.num(analysis.alerts.bits),
    });
  if (analysis.alerts.raids > 0)
    stats.push({
      label: t("reports.stat.raids"),
      value: `${analysis.alerts.raids} · +${analysis.alerts.raidViewers}`,
    });
  if (analysis.chat.hasData)
    stats.push({
      label: t("reports.stat.messages"),
      value: fmt.num(analysis.chat.total),
      sub: delta(analysis.chat.total, previous?.chatTotal, t),
    });

  return stats;
}
