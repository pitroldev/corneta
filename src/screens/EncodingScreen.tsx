import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  Cpu,
  Crosshair,
  Gauge,
  Info,
  Wand2,
} from "lucide-react";
import { useStore } from "../lib/store";
import type { EncoderKind, EncodingAction } from "../lib/types";
import { PLATFORMS } from "../lib/platforms";
import {
  bandFit,
  estimate,
  effectiveAction,
  lowestCommonDenominator,
  smartHybridAction,
} from "../lib/estimates";
import { toast } from "../lib/toast";
import { bold, rich, useI18n, type I18n, type MessageKey } from "../lib/i18n";
import { cn, fmtResolution } from "../lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Hint,
  PlatformGlyph,
  SectionTitle,
} from "../components/ui";
import { Select, type SelectOption } from "../components/Select";
import { ReframeEditor } from "../components/ReframeEditor";
import { ObsQualityGuide } from "../components/ObsQualityGuide";
import { QualityModeCards, useModeEstimates } from "../components/QualityModes";

const MIN_BR = 1000;
const MAX_BR = 51000;

export function EncodingScreen() {
  const config = useStore((s) => s.config);
  const encoders = useStore((s) => s.encoders);
  const setMode = useStore((s) => s.setMode);
  const updateTarget = useStore((s) => s.updateTarget);
  const uploadMbps = useStore((s) => s.uploadMbps);
  // Measuring upload during a stream would consume its bandwidth.
  const onAir = useStore(
    (s) => s.snapshot.state === "live" || s.snapshot.state === "starting",
  );
  const runUploadTest = useStore((s) => s.runUploadTest);
  const refreshEncoders = useStore((s) => s.refreshEncoders);
  const encodersError = useStore((s) => s.encodersError);
  const requestNavigate = useStore((s) => s.requestNavigate);
  const { t, fmt } = useI18n();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const tuningToggleRef = useRef<HTMLButtonElement>(null);
  const openTuning = () => {
    setShowAdvanced(true);
    const toggle = tuningToggleRef.current;
    toggle?.scrollIntoView({ behavior: "smooth", block: "start" });
    toggle?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (encoders.length === 0) void refreshEncoders();
  }, [encoders.length, refreshEncoders]);

  const anyHw = encoders.some((e) => e.available && e.kind !== "software");
  const estimates = useModeEstimates();

  if (!config || !estimates) return null;

  const lcd = lowestCommonDenominator(config);
  const anyEnabled = config.targets.some((x) => x.enabled);

  const maxHw = Math.max(
    0,
    ...encoders
      .filter(
        (e) => e.available && e.kind !== "software" && e.maxSessions != null,
      )
      .map((e) => e.maxSessions!),
  );
  const activeEst =
    estimates.get(config.mode) ?? estimate(config, { anyHwAvailable: anyHw });
  // Only GPU transcodes count against hardware session limits.
  const overSessions = maxHw > 0 && activeEst.hwTranscodeCount > maxHw;

  const verticalCopies = config.targets.filter((x) => {
    const r = PLATFORMS[x.platformId].recommended;
    return (
      x.enabled &&
      r.height > r.width &&
      effectiveAction(config.mode, x) === "copy"
    );
  });
  const verticalNames = verticalCopies.map((x) => x.name);

  const activeFit = bandFit(activeEst.uploadKbps, uploadMbps);
  const hybridFit =
    config.mode !== "hybrid"
      ? bandFit(estimates.get("hybrid")!.uploadKbps, uploadMbps)
      : "bad";
  const hybridFits = hybridFit === "ok" || hybridFit === "warn";

  const measure = async () => {
    setMeasuring(true);
    try {
      await runUploadTest();
    } catch {
      toast.error(t("encoding.upload.measure.error"));
    } finally {
      setMeasuring(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        title={t("encoding.header.title")}
        subtitle={t("encoding.header.subtitle")}
      />

      {!anyEnabled && (
        <EmptyState
          className="mb-4"
          title={t("encoding.empty.title")}
          action={
            <Button
              variant="primary"
              onClick={() => requestNavigate("platforms")}
            >
              {t("encoding.empty.cta")}
            </Button>
          }
        >
          {t("encoding.tuning.noPlatforms")}
        </EmptyState>
      )}

      <QualityModeCards />

      <p className="mt-3 min-h-4 truncate text-xs text-ink-faint">
        {uploadMbps == null
          ? t("encoding.upload.unmeasured")
          : bold(t, "encoding.upload.measured", { mbps: fmt.dec(uploadMbps) })}
        {onAir ? (
          <span>{t("encoding.upload.onair")}</span>
        ) : (
          <button
            type="button"
            onClick={measure}
            disabled={measuring}
            className="font-bold text-brass hover:underline disabled:opacity-60"
          >
            {measuring
              ? t("encoding.upload.measuring")
              : uploadMbps == null
                ? t("encoding.upload.measureNow")
                : t("encoding.upload.measureAgain")}
          </button>
        )}
      </p>

      {verticalCopies.length > 0 && (
        <Card className="mt-4 flex gap-3 border-2 border-bad/40 bg-bad/10">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" />
          <div className="flex-1 text-sm text-ink-muted">
            <p>
              {bold(
                t,
                config.mode === "passthrough"
                  ? "encoding.vertical.warn.passthrough"
                  : "encoding.vertical.warn.copy",
                {
                  platforms: verticalNames.join(
                    t("encoding.vertical.warn.join"),
                  ),
                },
              )}
            </p>
            {config.mode === "passthrough" ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setMode("hybrid")}
              >
                <Wand2 className="size-3.5 text-brass" />{" "}
                {t("encoding.vertical.cta.hybrid")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() =>
                  verticalCopies.forEach((x) =>
                    updateTarget(x.id, {
                      encoding: { ...x.encoding, hybridOverride: undefined },
                    }),
                  )
                }
              >
                <Wand2 className="size-3.5 text-brass" />{" "}
                {t("encoding.vertical.cta.auto")}
              </Button>
            )}
          </div>
        </Card>
      )}

      {activeFit === "bad" && (
        <Card className="mt-4 flex gap-3 border-2 border-bad/40 bg-bad/10">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" />
          <div className="flex-1 text-sm text-ink-muted">
            <p>
              {bold(t, "encoding.band.over.body", {
                bitrate: fmt.bitrate(activeEst.uploadKbps),
                mbps: fmt.dec(uploadMbps ?? 0),
              })}
            </p>
            {hybridFits ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setMode("hybrid")}
              >
                <Wand2 className="size-3.5 text-brass" />{" "}
                {t(
                  hybridFit === "ok"
                    ? "encoding.band.cta.hybridOk"
                    : "encoding.band.cta.hybridWarn",
                )}
              </Button>
            ) : config.mode === "passthrough" ? (
              <p className="mt-1">
                {rich(t, "encoding.band.fix.passthrough", {
                  link: (
                    <button
                      onClick={() => setShowGuide(true)}
                      className="font-bold text-brass hover:underline"
                    >
                      {t("encoding.band.fix.passthrough.link")}
                    </button>
                  ),
                })}
              </p>
            ) : (
              <p className="mt-1">
                {rich(t, "encoding.band.fix.tuning", {
                  link: (
                    <button
                      type="button"
                      onClick={openTuning}
                      className="font-bold text-brass hover:underline"
                    >
                      {t("encoding.band.fix.tuning.link")}
                    </button>
                  ),
                })}
              </p>
            )}
          </div>
        </Card>
      )}

      {overSessions && (
        <Card className="mt-4 flex gap-3 border-2 border-bad/40 bg-bad/10">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" />
          <p className="text-sm text-ink-muted">
            {bold(
              t,
              config.mode === "hybrid"
                ? "encoding.sessions.over.hybrid"
                : "encoding.sessions.over.other",
              { n: activeEst.hwTranscodeCount, max: maxHw },
            )}
          </p>
        </Card>
      )}

      <Card className="mt-4 flex gap-3 bg-surface-2">
        <Info className="mt-0.5 size-5 shrink-0 text-brass" />
        <div className="flex-1 text-sm text-ink-muted">
          {lcd.videoKbps != null && lcd.capBy ? (
            <p>
              {bold(t, "encoding.obs.lcd", {
                bitrate: fmt.bitrate(lcd.videoKbps),
                platform: lcd.capBy,
              })}
            </p>
          ) : (
            <p>{bold(t, "encoding.obs.noCopy")}</p>
          )}
          <p className="mt-1 text-xs text-ink-faint">
            {t("encoding.obs.path")}
            <button
              onClick={() => setShowGuide(true)}
              className="font-bold text-brass hover:underline"
            >
              {t("encoding.obs.guideLink")}
            </button>
          </p>
        </div>
      </Card>

      {showGuide && <ObsQualityGuide onClose={() => setShowGuide(false)} />}

      <div className="mt-7">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
          <Cpu className="size-4" /> {t("encoding.encoders.title")}
        </h3>
        {encoders.length === 0 ? (
          encodersError ? (
            <Card className="flex flex-wrap items-center gap-3 bg-surface-2 text-sm text-ink-muted">
              <p className="min-w-0 flex-1">{t("encoding.encoders.error")}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refreshEncoders()}
              >
                {t("golive.error.retry")}
              </Button>
            </Card>
          ) : (
            <Card className="bg-surface-2 text-sm text-ink-muted">
              {t("encoding.encoders.loading")}
            </Card>
          )
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {encoders.map((e) => (
                <span
                  key={e.kind}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-bold",
                    e.available
                      ? "bg-ok/15 text-ok"
                      : "bg-surface-2 text-ink-faint line-through",
                  )}
                >
                  {e.label}
                  {!e.available && (
                    <span className="sr-only">
                      {t("encoding.encoders.unavailable.sr")}
                    </span>
                  )}
                </span>
              ))}
            </div>
            {!anyHw && (
              <p className="mt-2 text-xs text-ink-faint">
                {t("encoding.encoders.noHw")}
              </p>
            )}
          </>
        )}
      </div>

      <div className="mt-7">
        <button
          ref={tuningToggleRef}
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          className="mb-2 flex w-full items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint transition-colors hover:text-ink-muted"
        >
          <Gauge className="size-4" /> {t("encoding.tuning.title")}
          <span className="font-medium normal-case tracking-normal text-ink-faint/70">
            {t("encoding.tuning.advanced")}
          </span>
          <ChevronDown
            className={cn(
              "ml-auto size-4 transition-transform",
              showAdvanced && "rotate-180",
            )}
          />
        </button>
        {showAdvanced &&
          (config.mode === "passthrough" ? (
            <Card className="bg-surface-2 text-sm text-ink-muted">
              {bold(t, "encoding.tuning.passthrough.empty")}
              <button
                onClick={() => setShowGuide(true)}
                className="font-bold text-brass hover:underline"
              >
                {t("encoding.tuning.passthrough.guideLink")}
              </button>
            </Card>
          ) : anyEnabled ? (
            <div className="flex flex-col gap-2">
              {config.targets
                .filter((x) => x.enabled)
                .map((x) => (
                  <PerTargetRow key={x.id} targetId={x.id} />
                ))}
            </div>
          ) : (
            <Card className="bg-surface-2 text-sm text-ink-muted">
              {t("encoding.tuning.noPlatforms")}
            </Card>
          ))}
      </div>
    </div>
  );
}

function friendlyEncoder(
  t: I18n["t"],
  x: { kind: EncoderKind; label: string },
): string {
  return x.kind === "software"
    ? t("encoding.encoder.cpu")
    : t("encoding.encoder.gpu", { label: x.label });
}

function PerTargetRow({ targetId }: { targetId: string }) {
  const config = useStore((s) => s.config)!;
  const updateTarget = useStore((s) => s.updateTarget);
  const encoders = useStore((s) => s.encoders);
  const { t, fmt } = useI18n();
  const target = config.targets.find((x) => x.id === targetId)!;
  const preset = PLATFORMS[target.platformId];
  const enc = target.encoding;
  const p = enc.preset ?? preset.recommended;
  const action = effectiveAction(config.mode, target);
  const isVertical = p.height > p.width;
  const recVertical = preset.recommended.height > preset.recommended.width;
  const [reframing, setReframing] = useState(false);
  const [showBrNumber, setShowBrNumber] = useState(false);
  // Commit numeric drafts on blur or Enter; intermediate keystrokes would alter live estimates.
  const [brDraft, setBrDraft] = useState<string | null>(null);

  const recBr = preset.recommended.videoBitrateKbps;
  const draftNum = brDraft == null ? p.videoBitrateKbps : Number(brDraft);
  const brInvalid = !(
    Number.isFinite(draftNum) &&
    draftNum >= MIN_BR &&
    draftNum <= MAX_BR
  );

  const patchPreset = (patch: Partial<typeof p>) =>
    updateTarget(target.id, {
      encoding: { ...enc, preset: { ...p, ...patch } },
    });

  const clampBr = (v: number) =>
    Math.min(MAX_BR, Math.max(MIN_BR, Math.round(v / 100) * 100));
  const stops: { nameKey: MessageKey; kbps: number }[] = [
    { nameKey: "encoding.target.stop.eco", kbps: clampBr(recBr * 0.6) },
    { nameKey: "encoding.target.stop.standard", kbps: recBr },
    { nameKey: "encoding.target.stop.sharp", kbps: clampBr(recBr * 1.4) },
  ];
  const stopIdx = stops.findIndex((s) => s.kbps === p.videoBitrateKbps);

  const autoEnc =
    encoders.find((x) => x.available && x.kind !== "software") ??
    encoders.find((x) => x.available);
  const autoResolved = autoEnc ? friendlyEncoder(t, autoEnc) : undefined;

  const encoderOptions: SelectOption<EncoderKind>[] = [
    { value: "auto", label: t("encoding.target.encoder.auto") },
    ...encoders
      .filter((x) => x.available)
      .map((x) => ({ value: x.kind, label: friendlyEncoder(t, x) })),
  ];

  const autoAct = smartHybridAction(target.platformId);
  const overrideOpts: {
    v: EncodingAction | undefined;
    labelKey: MessageKey;
  }[] = [
    {
      v: undefined,
      labelKey:
        autoAct === "transcode"
          ? "encoding.target.override.auto.transcode"
          : "encoding.target.override.auto.copy",
    },
    { v: "transcode", labelKey: "encoding.target.override.transcode" },
    { v: "copy", labelKey: "encoding.target.override.copy" },
  ];

  return (
    <>
      <Card className="bg-surface-2 py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <PlatformGlyph id={target.platformId} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-sm font-bold">
              {target.name}
            </div>
            <div className="text-[11px] text-ink-faint">
              {action === "copy"
                ? t("encoding.target.copy.resolution")
                : fmtResolution(p.width, p.height, p.fps)}
            </div>
          </div>
          {config.mode === "hybrid" && (
            <div className="flex h-9 shrink-0 items-center overflow-hidden rounded-md border-2 border-border">
              {overrideOpts.map((o) => {
                // Rust serializes Option::None as null; normalize it to the undefined automatic option.
                const sel = (enc.hybridOverride ?? undefined) === o.v;
                return (
                  <button
                    key={o.labelKey}
                    type="button"
                    aria-pressed={sel}
                    onClick={() =>
                      updateTarget(target.id, {
                        encoding: { ...enc, hybridOverride: o.v },
                      })
                    }
                    className={cn(
                      "h-full px-2.5 text-[11px] font-bold transition-colors",
                      sel
                        ? "bg-brass text-brass-ink"
                        : "bg-surface text-ink-muted hover:bg-surface-3",
                    )}
                  >
                    {t(o.labelKey)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-3 min-h-52 border-t border-border-soft pt-3 sm:min-h-28">
          {action === "transcode" ? (
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1fr)_13rem]">
              <div className="flex flex-col gap-1.5 text-[11px] font-semibold text-ink-faint">
                <span className="flex items-center gap-1">
                  {t("encoding.target.quality.label")}
                  <Hint text={t("encoding.target.quality.hint")} />
                </span>
                <div className="flex h-9 w-fit items-center overflow-hidden rounded-md border-2 border-border">
                  {stops.map((s, i) => (
                    <button
                      key={s.nameKey}
                      type="button"
                      aria-pressed={stopIdx === i}
                      title={fmt.bitrate(s.kbps)}
                      onClick={() => patchPreset({ videoBitrateKbps: s.kbps })}
                      className={cn(
                        "h-full px-3 text-[11px] font-bold transition-colors",
                        stopIdx === i
                          ? "bg-brass text-brass-ink"
                          : "bg-surface text-ink-muted hover:bg-surface-3",
                      )}
                    >
                      {t(s.nameKey)}
                    </button>
                  ))}
                </div>
                <div className="flex h-8 items-center gap-2">
                  {showBrNumber ? (
                    <>
                      <input
                        type="number"
                        step={500}
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- Focus follows an explicit request to edit this value.
                        autoFocus
                        value={brDraft ?? String(p.videoBitrateKbps)}
                        onChange={(e) => setBrDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            (e.target as HTMLInputElement).blur();
                        }}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          const clamped =
                            e.target.value.trim() !== "" && Number.isFinite(v)
                              ? Math.min(
                                  MAX_BR,
                                  Math.max(MIN_BR, Math.round(v)),
                                )
                              : recBr;
                          if (clamped !== p.videoBitrateKbps)
                            patchPreset({ videoBitrateKbps: clamped });
                          setBrDraft(null);
                        }}
                        aria-invalid={brInvalid || undefined}
                        aria-label={t("encoding.target.bitrate.aria", {
                          platform: target.name,
                        })}
                        className={cn(
                          "h-8 w-24 rounded-md border-2 bg-surface px-2 text-sm tabular-nums outline-none focus:border-brass",
                          brInvalid
                            ? "border-bad focus:border-bad"
                            : "border-border",
                        )}
                      />
                      <span className="font-normal">kbps</span>
                      <button
                        type="button"
                        onClick={() => setShowBrNumber(false)}
                        className="font-semibold text-ink-faint hover:text-ink hover:underline"
                      >
                        {t("encoding.target.bitrate.close")}
                      </button>
                      {brInvalid ? (
                        <span className="font-medium text-bad">
                          {t("encoding.target.bitrate.range", {
                            min: MIN_BR,
                            max: MAX_BR,
                          })}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            patchPreset({ videoBitrateKbps: recBr })
                          }
                          className="font-bold text-brass hover:underline"
                        >
                          {t("encoding.target.bitrate.useRecommended", {
                            kbps: recBr,
                          })}
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="font-normal text-ink-faint">
                      {rich(t, "encoding.target.quality.summary", {
                        stop:
                          stopIdx === -1
                            ? t("encoding.target.quality.custom")
                            : t(stops[stopIdx].nameKey),
                        bitrate: fmt.bitrate(p.videoBitrateKbps),
                        link: (
                          <button
                            type="button"
                            onClick={() => setShowBrNumber(true)}
                            className="font-semibold text-brass hover:underline"
                          >
                            {t("encoding.target.bitrate.edit")}
                          </button>
                        ),
                      })}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5 text-[11px] font-semibold text-ink-faint">
                <span className="flex items-center gap-1">
                  {t("encoding.target.encoder.label")}
                  <Hint text={t("encoding.target.encoder.hint")} />
                </span>
                <Select
                  className="w-52"
                  aria-label={t("encoding.target.encoder.aria", {
                    platform: target.name,
                  })}
                  value={enc.encoder}
                  options={encoderOptions}
                  onChange={(v) =>
                    updateTarget(target.id, {
                      encoding: { ...enc, encoder: v },
                    })
                  }
                />
                <div className="flex h-8 items-center gap-3">
                  <span
                    className="min-w-0 flex-1 truncate font-normal text-ink-faint"
                    title={
                      enc.encoder === "auto" && autoResolved
                        ? t("encoding.target.encoder.uses", {
                            encoder: autoResolved,
                          })
                        : undefined
                    }
                  >
                    {enc.encoder === "auto" && autoResolved
                      ? t("encoding.target.encoder.uses", {
                          encoder: autoResolved,
                        })
                      : " "}
                  </span>
                  {isVertical && (
                    <button
                      type="button"
                      onClick={() => setReframing(true)}
                      className="flex shrink-0 items-center gap-1 font-bold text-brass hover:underline"
                    >
                      <Crosshair className="size-3.5" />{" "}
                      {t("encoding.target.reframe")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-22 flex-col justify-center gap-1">
              <div className="flex items-center gap-2">
                <Badge tone="neutral">{t("encoding.target.copy.badge")}</Badge>
                <span className="text-sm font-semibold text-ink">
                  {t("encoding.target.copy.headline")}
                </span>
              </div>
              <p className="text-xs text-ink-muted">
                {t("encoding.target.copy.body")}
              </p>
              {recVertical && (
                <p className="text-[11px] font-bold text-warn">
                  {t("encoding.target.copy.verticalWarn", {
                    platform: target.name,
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      </Card>
      <AnimatePresence>
        {reframing && (
          <ReframeEditor target={target} onClose={() => setReframing(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
