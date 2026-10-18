import { useId, useMemo, useState } from "react";
import { Clapperboard, Copy, Download, Table2 } from "lucide-react";
import { Button } from "../../components/ui";
import { api } from "../../lib/api";
import {
  collectMoments,
  momentsCsv,
  momentsEdl,
  youtubeChapters,
} from "../../lib/export/moments";
import { fileStamp, useI18n } from "../../lib/i18n";
import type { Highlight } from "../../lib/report";
import type { ReplayIndex } from "../../lib/replay";
import { toast } from "../../lib/toast";
import type { SessionData } from "../../lib/types";
import { errMsg } from "../../lib/utils";

type MomentsFile = "csv" | "edl";

export function ReportMomentsExport({
  data,
  highlights,
  replayIndex,
  className,
}: {
  data: SessionData;
  highlights: readonly Highlight[];
  replayIndex: ReplayIndex | null;
  className?: string;
}) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const headingId = useId();
  const reasonId = useId();
  const [saving, setSaving] = useState<MomentsFile | null>(null);
  const timeline = useMemo(
    () => collectMoments(data, highlights, replayIndex),
    [data, highlights, replayIndex],
  );
  const chapters = useMemo(() => youtubeChapters(timeline, t), [timeline, t]);
  const markerCount = timeline.moments.filter(
    (moment) => moment.kind === "marker",
  ).length;
  const highlightCount = timeline.moments.length - markerCount;
  const hasMoments = timeline.moments.length > 0;
  const counts = [
    highlightCount > 0
      ? tp("reports.moments.export.highlights", highlightCount)
      : null,
    markerCount > 0 ? tp("reports.moments.export.markers", markerCount) : null,
  ]
    .filter(Boolean)
    .join(" + ");
  const baseNote =
    timeline.base === "live"
      ? t("reports.moments.export.base.live")
      : timeline.files > 1
        ? t("reports.moments.export.base.files", { n: timeline.files })
        : t("reports.moments.export.base.recording");
  const fileName = `${t("reports.file.live")}-${fileStamp(data.meta.startedAt)}${t("reports.file.momentsSuffix")}`;

  const copyChapters = async () => {
    if (!chapters.ok) return;
    try {
      await navigator.clipboard.writeText(chapters.text);
      toast.success(
        t("reports.moments.chapters.copied", { count: chapters.count }),
      );
    } catch {
      toast.error(t("reports.moments.chapters.copyError"));
    }
  };

  const save = async (format: MomentsFile) => {
    if (saving) return;
    setSaving(format);
    try {
      const saved = await api.saveTextFile(
        format === "csv"
          ? {
              name: `${fileName}.csv`,
              label: t("reports.download.csv.label"),
              ext: "csv",
              content: momentsCsv(timeline, i18n),
            }
          : {
              name: `${fileName}.edl`,
              label: t("reports.moments.edl.filter"),
              ext: "edl",
              content: momentsEdl(timeline, { title: fileName, t }),
            },
      );
      if (saved) toast.success(t("reports.moments.saved"));
    } catch (error) {
      toast.error(t("reports.moments.saveError", { err: errMsg(error) }));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={headingId} className="flex items-center gap-2 text-base">
          <Download className="size-4 text-brass" aria-hidden />
          {t("reports.moments.export.title")}
        </h3>
        {counts ? (
          <span className="text-xs tabular-nums text-ink-faint">{counts}</span>
        ) : null}
      </div>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-muted">
        {baseNote}
      </p>
      {timeline.outside > 0 ? (
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-warn">
          {tp("reports.moments.export.outside", timeline.outside)}
        </p>
      ) : null}
      <div
        role="group"
        aria-labelledby={headingId}
        className="mt-3 flex flex-wrap gap-2"
      >
        <Button
          size="sm"
          variant="subtle"
          disabled={!chapters.ok}
          title={t(
            chapters.ok
              ? "reports.moments.chapters.hint"
              : "reports.moments.chapters.tooFew",
          )}
          aria-describedby={chapters.ok || !hasMoments ? undefined : reasonId}
          onClick={() => void copyChapters()}
        >
          <Copy className="size-4" />
          {t("reports.moments.chapters.action")}
        </Button>
        <Button
          size="sm"
          variant="subtle"
          disabled={!hasMoments || saving !== null}
          loading={saving === "csv"}
          title={t("reports.moments.csv.hint")}
          onClick={() => void save("csv")}
        >
          {saving === "csv" ? null : <Table2 className="size-4" />}
          {t("reports.moments.csv.action")}
        </Button>
        <Button
          size="sm"
          variant="subtle"
          disabled={!hasMoments || saving !== null}
          loading={saving === "edl"}
          title={t("reports.moments.edl.hint")}
          onClick={() => void save("edl")}
        >
          {saving === "edl" ? null : <Clapperboard className="size-4" />}
          {t("reports.moments.edl.action")}
        </Button>
      </div>
      {!chapters.ok && hasMoments ? (
        <p
          id={reasonId}
          className="mt-2 max-w-3xl text-xs leading-relaxed text-ink-muted"
        >
          {t("reports.moments.chapters.tooFew")}
          {timeline.base === "recording"
            ? ` ${t("reports.moments.chapters.markMore")}`
            : null}
        </p>
      ) : null}
    </div>
  );
}
