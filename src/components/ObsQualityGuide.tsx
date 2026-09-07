import { Check, Gauge, Route, X } from "lucide-react";
import { useStore } from "../lib/store";
import { PLATFORMS } from "../lib/platforms";
import { effectiveAction, lowestCommonDenominator } from "../lib/estimates";
import { bold, useI18n, type I18n } from "../lib/i18n";
import { Modal } from "./Modal";
import { Badge, Button, PlatformGlyph } from "./ui";

function encoderLabel(t: I18n["t"], kind: string, label: string): string {
  if (kind === "software") return t("encoding.encoder.cpu");
  return t("encoding.encoder.gpu", { label });
}

export function ObsQualityGuide({ onClose }: { onClose: () => void }) {
  const config = useStore((s) => s.config)!;
  const encoders = useStore((s) => s.encoders);
  const encodersError = useStore((s) => s.encodersError);
  const { t, fmt } = useI18n();

  const enabled = config.targets.filter((x) => x.enabled);
  const guardArmed =
    config.settings.guardianEnabled &&
    config.settings.guardianWatchlist.some((w) => w.trim().length >= 3);
  // Only Privacy Guard re-encodes the complete program; the BRB splicer preserves stream copy.
  const reencodesAll = guardArmed;

  const copies = reencodesAll
    ? []
    : enabled.filter((x) => effectiveAction(config.mode, x) === "copy");
  const transcodes = enabled.filter((x) => !copies.includes(x));

  const fps = Math.min(
    60,
    Math.max(30, ...enabled.map((x) => x.encoding.preset?.fps ?? 30)),
  );

  // Keep resolution selection aligned with engine.rs::program_resolution, including vertical crops and OCR.
  const needsFullHd =
    guardArmed ||
    enabled.length === 0 ||
    enabled.some((x) => {
      const p = x.encoding.preset ?? PLATFORMS[x.platformId].recommended;
      return p.height > p.width || Math.min(p.width, p.height) > 720;
    });
  const srcRes = needsFullHd ? "1920×1080" : "1280×720";

  // Copied destinations constrain input bitrate; re-encoded destinations use a higher-quality local source.
  const lcd = lowestCommonDenominator(config);
  const hasCopy = copies.length > 0 && lcd.videoKbps != null;
  const contribKbps = needsFullHd
    ? fps >= 60
      ? 12000
      : 10000
    : fps >= 60
      ? 8000
      : 6500;
  const obsKbps = hasCopy ? lcd.videoKbps! : contribKbps;

  const hw = encoders.find((e) => e.available && e.kind !== "software");
  const encAdvice =
    encoders.length === 0
      ? t(
          encodersError
            ? "encoding.guide.encoder.error"
            : "encoding.guide.encoder.checking",
        )
      : hw
        ? encoderLabel(t, hw.kind, hw.label)
        : t("encoding.guide.encoder.cpuOnly");

  return (
    <Modal
      title={t("encoding.guide.title")}
      onClose={onClose}
      className="max-w-lg rounded-xl bg-surface p-5 pop"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 id="obs-guide-title" className="flex items-center gap-2 text-xl">
          <Gauge className="size-5 text-brass" /> {t("encoding.guide.title")}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label={t("encoding.close")}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="rounded-md bg-surface-2 p-3">
        <div className="mb-1.5 flex items-center gap-2 text-sm font-bold">
          <Route className="size-4 text-brass" />{" "}
          {t("encoding.guide.path.title")}
        </div>
        <p className="text-xs leading-relaxed text-ink-muted">
          {bold(t, "encoding.guide.path.lede")}
        </p>
        <div className="mt-2 flex flex-col gap-1.5 text-xs">
          {reencodesAll ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="brass">{t("encoding.guide.badge.redo")}</Badge>
              <span className="text-ink-muted">
                {t("encoding.guide.guardian")}
              </span>
            </div>
          ) : (
            <>
              {copies.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral">
                    {t("encoding.target.copy.badge")}
                  </Badge>
                  {copies.map((x) => (
                    <span
                      key={x.id}
                      className="flex items-center gap-1 text-ink-muted"
                    >
                      <PlatformGlyph id={x.platformId} size={14} /> {x.name}
                    </span>
                  ))}
                  <span className="text-ink-faint">
                    {bold(t, "encoding.guide.copy.suffix")}
                  </span>
                </div>
              )}
              {transcodes.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="brass">{t("encoding.guide.badge.redo")}</Badge>
                  {transcodes.map((x) => (
                    <span
                      key={x.id}
                      className="flex items-center gap-1 text-ink-muted"
                    >
                      <PlatformGlyph id={x.platformId} size={14} /> {x.name}
                    </span>
                  ))}
                </div>
              )}
              {enabled.length === 0 && (
                <span className="text-ink-faint">
                  {t("encoding.guide.noPlatforms")}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 text-sm font-bold">
          {bold(t, "encoding.guide.setup.title")}
        </div>
        <div className="divide-y divide-border-soft rounded-md bg-surface-2 px-3 text-sm">
          <GuideRow k={t("encoding.guide.row.encoder")} v={encAdvice} />
          <GuideRow k={t("encoding.guide.row.rateControl")} v="CBR" />
          <GuideRow
            k={t("encoding.guide.row.bitrate")}
            v={fmt.bitrate(obsKbps)}
            note={
              hasCopy
                ? t("encoding.guide.row.bitrate.noteCopy", {
                    platform: lcd.capBy ?? "",
                  })
                : t("encoding.guide.row.bitrate.noteFree")
            }
          />
          <GuideRow k={t("encoding.guide.row.keyframe")} v="2 s" />
          <GuideRow
            k={t("encoding.guide.row.video")}
            v={`${srcRes} · ${fps} FPS`}
            note={
              needsFullHd
                ? t("encoding.guide.row.video.noteFullHd")
                : t("encoding.guide.row.video.note720")
            }
          />
        </div>
        {!hw && (needsFullHd || fps >= 60) && (
          <p className="mt-2 text-[11px] font-semibold leading-relaxed text-warn">
            {t(
              fps >= 60
                ? "encoding.guide.nohw.fps60"
                : "encoding.guide.nohw.fps30",
              { res: needsFullHd ? "1080p" : "720p" },
            )}
          </p>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          {bold(t, "encoding.guide.simpleMode")}
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-1.5 text-xs text-ink-muted">
        <p className="flex gap-2">
          <Check
            className="mt-0.5 size-3.5 shrink-0 text-ok"
            strokeWidth={2.8}
          />
          <span>
            <strong className="text-ink">
              {t("encoding.guide.why.onepass.strong")}
            </strong>{" "}
            {t("encoding.guide.why.onepass.text")}
          </span>
        </p>
        <p className="flex gap-2">
          <Check
            className="mt-0.5 size-3.5 shrink-0 text-ok"
            strokeWidth={2.8}
          />
          <span>{bold(t, "encoding.guide.why.cbr")}</span>
        </p>
        <p className="flex gap-2">
          <Check
            className="mt-0.5 size-3.5 shrink-0 text-ok"
            strokeWidth={2.8}
          />
          <span>
            <strong className="text-ink">
              {t("encoding.guide.why.changed.strong")}
            </strong>{" "}
            {t("encoding.guide.why.changed.text")}
          </span>
        </p>
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="primary" onClick={onClose}>
          {t("encoding.guide.done")}{" "}
          <Check className="size-4" strokeWidth={2.6} />
        </Button>
      </div>
    </Modal>
  );
}

function GuideRow({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 py-2">
      <span className="w-44 shrink-0 text-xs font-semibold text-ink-faint">
        {k}
      </span>
      <span className="font-display font-bold">{v}</span>
      {note && (
        <span className="min-w-0 flex-1 text-[11px] text-ink-faint">
          — {note}
        </span>
      )}
    </div>
  );
}
