import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Braces, Copy, Download, FileText, Table2, X } from "lucide-react";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/ui";
import { api } from "../../lib/api";
import type {
  DownloadFormat,
  selectedReportExport,
} from "../../lib/export/selected";
import { ReportClient } from "../../lib/reportClient";
import { fileStamp, useI18n, type Fmt, type I18n } from "../../lib/i18n";
import { PLATFORMS } from "../../lib/platforms";
import {
  drawRecap,
  recapToBlob,
  RECAP_HEIGHT,
  RECAP_WIDTH,
  type RecapData,
  type RecapStat,
} from "../../lib/recap";
import type { ReportAnalysis } from "../../lib/report";
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

  const moment = analysis.highlights[0]?.reason;
  const bigLabels = new Set(big.map((stat) => stat.label));
  return {
    brand: "CORNETA",
    date: fmt.date(data.meta.startedAt),
    title: t("reports.recap.title", { date: fmt.date(data.meta.startedAt) }),
    subtitle: t("reports.recap.duration", {
      duration: fmt.dur(data.meta.durationSec),
    }),
    big,
    small: small.filter((stat) => !bigLabels.has(stat.label)).slice(0, 6),
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
  const [busy, setBusy] = useState<"copy" | "download" | null>(null);
  const recap = useMemo(
    () => buildRecap(data, analysis, t, fmt),
    [analysis, data, fmt, t],
  );

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
  }, [recap, t]);

  const copy = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy("copy");
    try {
      const blob = await recapToBlob(canvas);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      toast.success(t("reports.recap.copied"));
    } catch {
      toast.error(t("reports.recap.error.copy"));
    } finally {
      setBusy(null);
    }
  };
  const download = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy("download");
    try {
      const url = URL.createObjectURL(await recapToBlob(canvas));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${t("reports.file.live")}-${fileStamp(data.meta.startedAt)}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (error) {
      toast.error(t("reports.recap.error.download", { err: errMsg(error) }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      title={t("reports.recap.modal.name")}
      onClose={onClose}
      className="flex h-[calc(100vh-2rem)] max-h-[60rem] max-w-7xl flex-col overflow-hidden rounded-xl bg-surface pop"
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border-soft px-4 py-3 sm:px-5 sm:py-4">
        <div className="min-w-0">
          <h3 className="text-xl sm:text-2xl">
            {t("reports.recap.modal.heading")}
          </h3>
          <p className="mt-1 max-w-2xl text-xs text-ink-muted sm:text-sm">
            {t("reports.recap.modal.description")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="size-9 shrink-0 px-0"
          onClick={onClose}
          aria-label={t("reports.recap.modal.close")}
          title={t("reports.recap.modal.close")}
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-1">
        <div className="flex min-h-0 items-center justify-center overflow-auto bg-night p-3 sm:p-5">
          <canvas
            ref={canvasRef}
            width={RECAP_WIDTH}
            height={RECAP_HEIGHT}
            role="img"
            aria-label={t("reports.recap.previewAria")}
            className="block h-auto max-h-full w-auto max-w-full shrink-0 border-2 border-border-soft object-contain"
            style={{ aspectRatio: `${RECAP_WIDTH} / ${RECAP_HEIGHT}` }}
          />
        </div>

        <aside className="flex min-h-0 flex-col border-t border-border-soft bg-surface px-4 py-3 sm:px-5 sm:py-4 lg:border-t-0 lg:border-l">
          <div className="hidden lg:block">
            <p className="font-display text-lg font-bold">
              {t("reports.recap.modal.ready")}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">
              {t("reports.recap.modal.hint")}
            </p>
          </div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-ink-faint lg:mt-auto">
            {t("reports.recap.modal.format", {
              width: RECAP_WIDTH,
              height: RECAP_HEIGHT,
            })}
          </p>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            <Button
              variant="primary"
              loading={busy === "copy"}
              disabled={busy !== null}
              onClick={() => void copy()}
            >
              {busy !== "copy" ? <Copy className="size-4" /> : null}
              {t("reports.recap.copy")}
            </Button>
            <Button
              variant="subtle"
              loading={busy === "download"}
              disabled={busy !== null}
              onClick={() => void download()}
            >
              {busy !== "download" ? <Download className="size-4" /> : null}
              {t("reports.recap.download")}
            </Button>
          </div>
        </aside>
      </div>
    </Modal>
  );
}

export function DownloadModal({
  data,
  analysis,
  onClose,
}: {
  data: SessionData;
  analysis: ReportAnalysis;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const client = useRef<ReportClient | null>(null);
  useEffect(
    () => () => {
      client.current?.dispose();
      client.current = null;
    },
    [],
  );

  const download = async (format: DownloadFormat) => {
    if (client.current) return;
    const worker = new ReportClient();
    client.current = worker;
    setBusy(true);
    try {
      const file = await worker.run<
        Awaited<ReturnType<typeof selectedReportExport>>
      >({
        kind: "export",
        data,
        analysis,
        locale: i18n.locale,
        format,
        anonymous,
      });
      if (client.current !== worker) return;
      if (await api.saveTextFile(file)) {
        toast.success(t("reports.download.saved"));
        onClose();
      }
    } catch (error) {
      if (client.current === worker)
        toast.error(t("reports.download.error", { err: errMsg(error) }));
    } finally {
      worker.dispose();
      if (client.current === worker) {
        client.current = null;
        setBusy(false);
      }
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
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label={t("encoding.close")}
          title={t("encoding.close")}
        >
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
