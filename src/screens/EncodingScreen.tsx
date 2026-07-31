import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  Cpu,
  Crosshair,
  Gauge,
  Info,
  Layers,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useStore } from "../lib/store";
import type { EncoderKind, EncodingAction, EncodingMode } from "../lib/types";
import { PLATFORMS } from "../lib/platforms";
import {
  bandFit,
  estimate,
  effectiveAction,
  lowestCommonDenominator,
  smartHybridAction,
} from "../lib/estimates";
import { toast } from "../lib/toast";
import {
  bold,
  rich,
  useI18n,
  useT,
  type I18n,
  type MessageKey,
} from "../lib/i18n";
import { cn, fmtResolution } from "../lib/utils";
import {
  Badge,
  Button,
  Card,
  Hint,
  PlatformGlyph,
  SectionTitle,
} from "../components/ui";
import { Select, type SelectOption } from "../components/Select";
import { ReframeEditor } from "../components/ReframeEditor";
import { ObsQualityGuide } from "../components/ObsQualityGuide";

const MIN_BR = 1000;
const MAX_BR = 51000;

// `id` é valor de enum (vai pra config e pro Rust) — só os *Key* são copy.
const MODES: {
  id: EncodingMode;
  titleKey: MessageKey;
  tagKey: MessageKey;
  tone: "brass" | "neutral";
  icon: typeof Cpu;
  descKey: MessageKey;
}[] = [
  {
    id: "passthrough",
    titleKey: "encoding.mode.passthrough.title",
    tagKey: "encoding.mode.passthrough.tag",
    tone: "neutral",
    icon: Layers,
    descKey: "encoding.mode.passthrough.desc",
  },
  {
    id: "hybrid",
    titleKey: "encoding.mode.hybrid.title",
    tagKey: "encoding.mode.hybrid.tag",
    tone: "brass",
    icon: Wand2,
    descKey: "encoding.mode.hybrid.desc",
  },
  {
    id: "per-platform",
    titleKey: "encoding.mode.perPlatform.title",
    tagKey: "encoding.mode.perPlatform.tag",
    tone: "neutral",
    icon: Sparkles,
    descKey: "encoding.mode.perPlatform.desc",
  },
];

export function EncodingScreen() {
  const config = useStore((s) => s.config);
  const encoders = useStore((s) => s.encoders);
  const setMode = useStore((s) => s.setMode);
  const updateTarget = useStore((s) => s.updateTarget);
  const uploadMbps = useStore((s) => s.uploadMbps);
  const snapshot = useStore((s) => s.snapshot);
  const runUploadTest = useStore((s) => s.runUploadTest);
  const refreshEncoders = useStore((s) => s.refreshEncoders);
  const { t, fmt } = useI18n();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [measuring, setMeasuring] = useState(false);

  useEffect(() => {
    if (encoders.length === 0) void refreshEncoders();
  }, [encoders.length, refreshEncoders]);

  if (!config) return null;

  const lcd = lowestCommonDenominator(config);

  // Quantas recodificações simultâneas a placa aguenta (heurística dos encoders).
  const maxHw = Math.max(
    0,
    ...encoders
      .filter(
        (e) => e.available && e.kind !== "software" && e.maxSessions != null,
      )
      .map((e) => e.maxSessions!),
  );
  const anyHw = encoders.some((e) => e.available && e.kind !== "software");
  const activeEst = estimate(config, { anyHwAvailable: anyHw });
  // Só transcodes que caem na PLACA disputam o limite de sessões (x264 é CPU).
  const overSessions = maxHw > 0 && activeEst.hwTranscodeCount > maxHw;

  // Plataforma vertical recebendo CÓPIA (vídeo deitado) — em QUALQUER modo, não só no
  // "Na lata": no Esperto um override "Copiar" causa o mesmo estrago, e o único aviso
  // ficava num texto de 11px dentro do acordeão fechado.
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
  // Se o Esperto couber na banda (mesmo no limite), é a saída de 1 clique do card vermelho.
  const hybridFit =
    config.mode !== "hybrid"
      ? bandFit(
          estimate({ ...config, mode: "hybrid" }, { anyHwAvailable: anyHw })
            .uploadKbps,
          uploadMbps,
        )
      : "bad";
  const hybridFits = hybridFit === "ok" || hybridFit === "warn";

  // Medir durante a transmissão roubaria banda da própria live.
  const onAir = snapshot.state === "live" || snapshot.state === "starting";
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
        kicker={t("encoding.header.kicker")}
        title={t("encoding.header.title")}
        subtitle={t("encoding.header.subtitle")}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {MODES.map((m) => {
          const est = estimate(
            { ...config, mode: m.id },
            { anyHwAvailable: anyHw },
          );
          const fit = bandFit(est.uploadKbps, uploadMbps);
          const active = config.mode === m.id;
          const Icon = m.icon;
          return (
            <motion.button
              key={m.id}
              onClick={() => setMode(m.id)}
              whileTap={{ scale: 0.97 }}
              aria-pressed={active}
              className={cn(
                "relative flex flex-col rounded-lg p-4 text-left transition",
                active
                  ? "border-2 border-brass bg-surface pop-brass"
                  : "border-2 border-transparent bg-surface-2 hover:bg-surface-3",
              )}
            >
              {/* Selo em linha própria: dividindo a linha com o título, ele quebrava
                  só no card de título longo e os três ficavam desalinhados. */}
              <Badge tone={m.tone} className="mb-2 self-start">
                {t(m.tagKey)}
              </Badge>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-md",
                    active
                      ? "bg-brass text-brass-ink"
                      : "bg-surface text-ink-muted",
                  )}
                >
                  <Icon className="size-4" strokeWidth={2.4} />
                </span>
                <span className="font-display text-lg font-bold">
                  {t(m.titleKey)}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                {t(m.descKey)}
              </p>
              {/* mt-auto: métricas ancoradas no rodapé — descrições de tamanhos
                  diferentes não desalinham as barras entre os três cards. */}
              <div className="mt-auto space-y-2 pt-3">
                <LoadBar load={est.load} />
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-faint">
                    {t("encoding.card.upload.label")}
                  </span>
                  <span className="font-display font-extrabold tabular-nums">
                    {fmt.bitrate(est.uploadKbps)}
                  </span>
                </div>
                {/* Slot SEMPRE presente: quando a medição chega, o texto preenche o
                    espaço já reservado — os 3 cards não crescem de uma vez. */}
                <div
                  className={cn(
                    "min-h-4 text-[11px] font-bold",
                    fit === "ok"
                      ? "text-ok"
                      : fit === "warn"
                        ? "text-warn"
                        : fit === "bad"
                          ? "text-bad"
                          : "text-ink-faint/60",
                  )}
                >
                  {fit === "ok"
                    ? t("encoding.fit.ok")
                    : fit === "warn"
                      ? t("encoding.fit.warn")
                      : fit === "bad"
                        ? t("encoding.fit.bad")
                        : " "}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Linha fixa (não some após medir → sem pulo). Texto CURTO de propósito: se
          quebrasse em 2 linhas no estado não-medido, medir encolheria o parágrafo. */}
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
              // No Na lata a qualidade se define no OBS — mandar pro "ajuste fino"
              // (que aqui diz "não tem o que ajustar") era um beco sem saída.
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
              <p className="mt-1">{bold(t, "encoding.band.fix.tuning")}</p>
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

      {/* Card do OBS SEMPRE presente (conteúdo muda, a moldura não): trocar um destino de
          cópia↔recodifica no ajuste fino não pode encolher a tela acima do cursor. */}
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
          <Card className="bg-surface-2 text-sm text-ink-muted">
            {t("encoding.encoders.loading")}
          </Card>
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

      {/* Sempre presente: no "Na lata" a seção explica por que não há o que ajustar,
          em vez de sumir da tela (sumir = pulo de layout + "cadê o ajuste fino?"). */}
      <div className="mt-7">
        <button
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
          ) : config.targets.some((x) => x.enabled) ? (
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

function LoadBar({ load }: { load: number }) {
  const t = useT();
  const pct = Math.round(load * 100);
  const tone = load > 0.66 ? "bg-bad" : load > 0.33 ? "bg-warn" : "bg-ok";
  const word = t(
    load >= 0.95
      ? "encoding.load.word.max"
      : load > 0.66
        ? "encoding.load.word.heavy"
        : load > 0.33
          ? "encoding.load.word.warm"
          : "encoding.load.word.easy",
  );
  // Sem percentual: é heurística, não medição — número exato passaria falsa precisão.
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-ink-faint">
          {t("encoding.load.label")}
        </span>
        <span className="font-display font-bold text-ink-muted">{word}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-sm bg-surface">
        <motion.div
          className={cn("h-full rounded-sm", tone)}
          animate={{ width: `${Math.max(4, pct)}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 26 }}
        />
      </div>
    </div>
  );
}

/** Tradução do encoder pra linguagem de gente ("quem faz o trabalho").
 *  Não é componente: recebe o `t` de quem chama. */
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
  // `target` (e não `t`) porque `t` aqui é a tradução.
  const target = config.targets.find((x) => x.id === targetId)!;
  const preset = PLATFORMS[target.platformId];
  const enc = target.encoding;
  const p = enc.preset ?? preset.recommended;
  const action = effectiveAction(config.mode, target);
  const isVertical = p.height > p.width;
  const recVertical = preset.recommended.height > preset.recommended.width;
  const [reframing, setReframing] = useState(false);
  const [showBrNumber, setShowBrNumber] = useState(false);
  // Rascunho LOCAL do número: commitar a cada tecla fazia os cards de modo e o veredito
  // de banda lá em cima piscarem com valores transitórios ("1" kbps) enquanto digitava.
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

  // Paradas do slider RELATIVAS ao recomendado da plataforma (cada uma tem o seu).
  const clampBr = (v: number) =>
    Math.min(MAX_BR, Math.max(MIN_BR, Math.round(v / 100) * 100));
  const stops: { nameKey: MessageKey; kbps: number }[] = [
    { nameKey: "encoding.target.stop.eco", kbps: clampBr(recBr * 0.6) },
    { nameKey: "encoding.target.stop.standard", kbps: recBr },
    { nameKey: "encoding.target.stop.sharp", kbps: clampBr(recBr * 1.4) },
  ];
  const stopIdx = stops.findIndex((s) => s.kbps === p.videoBitrateKbps);

  // O que o "Automático" vai escolher de verdade (1º hardware disponível, senão software).
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

  // No híbrido: 3 opções com a decisão do automático resolvida no rótulo.
  // `v` é valor de enum (vai pra config) — só o rótulo é copy.
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

  // GEOMETRIA ESTÁVEL: cabeçalho fixo (identidade + segmented do híbrido) e um corpo com
  // altura mínima única pros dois estados (recodifica/cópia) — trocar de opção, abrir o
  // número ou mudar o encoder NÃO move nada ao redor. (O layout antigo era um flex-wrap
  // justify-end que quebrava linha de forma imprevisível.)
  return (
    <>
      <Card className="bg-surface-2 py-3.5">
        {/* Cabeçalho: quem é + (no híbrido) o que fazer com ela */}
        <div className="flex flex-wrap items-center gap-3">
          <PlatformGlyph id={target.platformId} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-sm font-bold">
              {target.name}
            </div>
            <div className="text-[11px] text-ink-faint">
              {/* Em cópia a resolução/fps são as do OBS — mostrar as do preset aqui
                  parecia promessa de "mando 1080p60" que a cópia não cumpre. */}
              {action === "copy"
                ? t("encoding.target.copy.resolution")
                : fmtResolution(p.width, p.height, p.fps)}
            </div>
          </div>
          {config.mode === "hybrid" && (
            <div className="flex h-9 shrink-0 items-center overflow-hidden rounded-md border-2 border-border">
              {overrideOpts.map((o) => {
                // hybridOverride pode chegar como null do JSON (Rust serializa
                // Option::None assim) — normaliza pra casar com o v: undefined do Auto.
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

        {/* Corpo: mesma altura mínima nos dois estados → trocar cópia↔recodifica não pula.
            Abaixo de sm o grid empilha (fica mais alto) — o piso acompanha. */}
        <div className="mt-3 min-h-52 border-t border-border-soft pt-3 sm:min-h-28">
          {action === "transcode" ? (
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1fr)_13rem]">
              {/* Qualidade: segmented de 3 paradas (posição nunca mente — "personalizado"
                  simplesmente não acende nenhuma) + slot fixo pro número */}
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
                {/* Slot de altura FIXA: linha de status OU o editor de número — mesma h-8 */}
                <div className="flex h-8 items-center gap-2">
                  {showBrNumber ? (
                    <>
                      <input
                        type="number"
                        step={500}
                        autoFocus
                        value={brDraft ?? String(p.videoBitrateKbps)}
                        // Rascunho local: só COMMITA no blur/Enter — commitar por tecla
                        // fazia os cards de modo lá em cima piscarem com "1 kbps".
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
                      {/* "fechar" ANTES do trecho variável: a mensagem de inválido e o
                          "usar recomendado" trocam de largura — o alvo do clique não anda. */}
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

              {/* Encoder: coluna fixa à direita, com o "usa X" sempre reservado */}
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
                {/* Coluna de largura FIXA (13rem no grid): o "usa X" some ao escolher um
                    encoder explícito, e sem truncate a coluna encolhia deslizando o Select. */}
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
            // Estado "cópia": painel explicativo com a MESMA presença visual do estado
            // com controles — nada de badge solitária flutuando à direita.
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
