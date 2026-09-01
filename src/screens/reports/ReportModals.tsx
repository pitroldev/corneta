import { useEffect, useRef, useState, type ReactNode } from "react";
import { Braces, Copy, Download, FileText, Table2, X } from "lucide-react";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/ui";
import { api } from "../../lib/api";
import { anonymize } from "../../lib/export/anonymize";
import { seriesCsv } from "../../lib/export/csv";
import { reportHtml } from "../../lib/export/html";
import { reportJson } from "../../lib/export/json";
import { fileStamp, useI18n, type Fmt, type I18n } from "../../lib/i18n";
import { PLATFORMS } from "../../lib/platforms";
import {
  drawRecap,
  recapToBlob,
  RECAP_SIZE,
  type RecapData,
  type RecapStat,
} from "../../lib/recap";
import { analyze, type ReportAnalysis } from "../../lib/report";
import { toast } from "../../lib/toast";
import type { SessionData } from "../../lib/types";
import { errMsg } from "../../lib/utils";

function buildRecap(
  data: SessionData,
  analysis: ReportAnalysis,
  t: I18n["t"],
  fmt: Fmt,
): RecapData {
  const platforms = data.meta.platforms.map((platform) => ({
    name: platform.name,
    color:
      PLATFORMS[platform.platformId as keyof typeof PLATFORMS]?.color ??
      "#ffb323",
  }));
  const followers = analysis.byChannel.followersGained ?? 0;
  const big: RecapStat[] = [];
  if (analysis.viewers.hasData)
    big.push({
      label: t("reports.recap.stat.peakViewers"),
      value: fmt.num(analysis.viewers.peak),
    });
  if (analysis.chat.hasData)
    big.push({
      label: t("reports.recap.stat.messages"),
      value: fmt.num(analysis.chat.total),
    });

  const small: RecapStat[] = [];
  if (big.length > 0)
    small.push({
      label: t("reports.recap.stat.onAir"),
      value: fmt.dur(data.meta.durationSec),
    });
  if (analysis.viewers.hasData)
    small.push({
      label: t("reports.recap.stat.avg"),
      value: fmt.num(analysis.viewers.avg),
    });
  if (followers > 0)
    small.push({
      label: t("reports.recap.stat.newFollowers"),
      value: fmt.num(followers),
    });
  if (analysis.alerts.subs > 0)
    small.push({
      label: t("reports.recap.stat.subs"),
      value: String(analysis.alerts.subs),
    });
  if (analysis.alerts.bits > 0)
    small.push({
      label: t("reports.recap.stat.bits"),
      value: fmt.num(analysis.alerts.bits),
    });
  if (analysis.alerts.raids > 0)
    small.push({
      label: t("reports.recap.stat.raids"),
      value: String(analysis.alerts.raids),
    });
  if (big.length === 0) {
    big.push({
      label: t("reports.recap.stat.onAir"),
      value: fmt.dur(data.meta.durationSec),
    });
    if (analysis.alerts.subs > 0)
      big.push({
        label: t("reports.recap.stat.subs"),
        value: String(analysis.alerts.subs),
      });
  }

  const topMoment = analysis.highlights[0]?.reason;
  const moment = topMoment
    ? topMoment.length > 44
      ? `${topMoment.slice(0, 43)}…`
      : topMoment
    : undefined;
  const bigLabels = new Set(big.map((stat) => stat.label));
  return {
    brand: "CORNETA",
    date: fmt.date(data.meta.startedAt),
    title: t("reports.recap.title", { date: fmt.date(data.meta.startedAt) }),
    subtitle: `${fmt.dur(data.meta.durationSec)} · ${data.meta.platforms.map((platform) => platform.name).join(" · ")}`,
    big,
    small: small.filter((stat) => !bigLabels.has(stat.label)).slice(0, 4),
    moment,
    platforms,
    footer: t("reports.recap.footer"),
  };
}

export function RecapModal({
  data,
  analysis,
  onClose,
}: {
  data: SessionData;
  analysis: ReportAnalysis;
  onClose: () => void;
}) {
  const { t, fmt } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let alive = true;
    let frame = 0;
    const paint = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        frame = requestAnimationFrame(paint);
        return;
      }
      const context = canvas.getContext("2d");
      if (!context) {
        toast.error(t("reports.recap.error.canvas"));
        return;
      }
      try {
        const recap = buildRecap(data, analysis, t, fmt);
        drawRecap(context, recap, t);
        void (document.fonts?.ready ?? Promise.resolve()).then(() => {
          if (alive) drawRecap(context, recap, t);
        });
      } catch (error) {
        toast.error(t("reports.recap.error.draw", { err: errMsg(error) }));
      }
    };
    paint();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [analysis, data, fmt, t]);

  const copy = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await recapToBlob(canvas);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      toast.success(t("reports.recap.copied"));
    } catch {
      toast.error(t("reports.recap.error.copy"));
    }
  };
  const download = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = URL.createObjectURL(await recapToBlob(canvas));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${t("reports.file.live")}-${fileStamp(data.meta.startedAt)}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <Modal
      title={t("reports.recap.modal.name")}
      onClose={onClose}
      className="max-w-lg rounded-xl bg-surface p-5 pop"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xl">{t("reports.recap.modal.heading")}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        width={RECAP_SIZE}
        height={RECAP_SIZE}
        className="mb-3 w-full border-2 border-border-soft"
      />
      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" onClick={copy}>
          <Copy className="size-4" /> {t("reports.recap.copy")}
        </Button>
        <Button variant="subtle" className="flex-1" onClick={download}>
          <Download className="size-4" /> {t("reports.recap.download")}
        </Button>
      </div>
    </Modal>
  );
}

type DownloadFormat = "html" | "csv" | "json";

export function DownloadModal({
  data,
  onClose,
}: {
  data: SessionData;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);

  const download = async (format: DownloadFormat) => {
    setBusy(true);
    try {
      const report = anonymous ? anonymize(data) : data;
      const analysis = analyze(report, t);
      const base = `${t("reports.file.live")}-${fileStamp(report.meta.startedAt)}`;
      const file = {
        html: {
          name: `${base}.html`,
          label: t("reports.download.html.label"),
          ext: "html",
          content: reportHtml(report, analysis, i18n),
        },
        csv: {
          name: `${base}${t("reports.file.seriesSuffix")}.csv`,
          label: t("reports.download.csv.label"),
          ext: "csv",
          content: seriesCsv(report, analysis, i18n),
        },
        json: {
          name: `${base}.json`,
          label: t("reports.download.json.label"),
          ext: "json",
          content: reportJson(report, analysis),
        },
      }[format];
      if (await api.saveTextFile(file)) {
        toast.success(t("reports.download.saved"));
        onClose();
      }
    } catch (error) {
      toast.error(t("reports.download.error", { err: errMsg(error) }));
    } finally {
      setBusy(false);
    }
  };

  const options: [DownloadFormat, ReactNode, string, string][] = [
    [
      "html",
      <FileText key="html" className="size-4" />,
      t("reports.download.html.label"),
      t("reports.download.html.desc"),
    ],
    [
      "csv",
      <Table2 key="csv" className="size-4" />,
      t("reports.download.csv.label"),
      t("reports.download.csv.desc"),
    ],
    [
      "json",
      <Braces key="json" className="size-4" />,
      t("reports.download.json.label"),
      t("reports.download.json.desc"),
    ],
  ];

  return (
    <Modal
      title={t("reports.download.modal.name")}
      onClose={onClose}
      className="max-w-md rounded-xl bg-surface p-5 pop"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xl">{t("reports.download.modal.name")}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {options.map(([format, icon, title, description]) => (
          <button
            key={format}
            disabled={busy}
            onClick={() => void download(format)}
            className="flex items-start gap-3 rounded-lg border-2 border-border bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-brass disabled:opacity-50"
          >
            <span className="mt-0.5 text-brass">{icon}</span>
            <span className="flex-1">
              <span className="block font-display font-bold">{title}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                {description}
              </span>
            </span>
          </button>
        ))}
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg bg-surface-2 px-3 py-2.5">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-brass"
          checked={anonymous}
          onChange={(event) => setAnonymous(event.target.checked)}
        />
        <span>
          <span className="block text-sm font-bold">
            {t("reports.download.anon.title")}
          </span>
          <span className="mt-0.5 block text-xs text-ink-muted">
            {t("reports.download.anon.desc")}
          </span>
        </span>
      </label>
    </Modal>
  );
}
