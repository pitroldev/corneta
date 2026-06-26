import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Cpu, Crosshair, Gauge, Info, Layers, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { useStore } from "../lib/store";
import type { EncoderKind, EncodingMode } from "../lib/types";
import { PLATFORMS } from "../lib/platforms";
import { estimate, effectiveAction, lowestCommonDenominator } from "../lib/estimates";
import { cn, fmtBitrate } from "../lib/utils";
import { Badge, Button, Card, Hint, PlatformGlyph, SectionTitle } from "../components/ui";
import { Select, type SelectOption } from "../components/Select";
import { ReframeEditor } from "../components/ReframeEditor";

const MIN_BR = 1000;
const MAX_BR = 51000;

const MODES: {
  id: EncodingMode;
  title: string;
  tag: string;
  tone: "brass" | "neutral";
  icon: typeof Cpu;
  desc: string;
}[] = [
  {
    id: "passthrough",
    title: "Na lata",
    tag: "Mais leve",
    tone: "neutral",
    icon: Layers,
    desc: "O OBS recodifica uma vez e a mesma imagem vai pra todas. Quase não pesa na CPU — mas todas ficam no mesmo padrão.",
  },
  {
    id: "hybrid",
    title: "Esperto",
    tag: "Recomendado",
    tone: "brass",
    icon: Wand2,
    desc: "Copia onde dá e recodifica só onde precisa (ex.: vertical no TikTok). Decide sozinho.",
  },
  {
    id: "per-platform",
    title: "Caprichado",
    tag: "Máx. qualidade",
    tone: "neutral",
    icon: Sparkles,
    desc: "Uma recodificação sob medida pra cada plataforma. Melhor imagem possível, mas é o mais pesado (recodifica todas).",
  },
];

export function EncodingScreen() {
  const config = useStore((s) => s.config);
  const encoders = useStore((s) => s.encoders);
  const setMode = useStore((s) => s.setMode);
  if (!config) return null;

  const lcd = lowestCommonDenominator(config);
  const hasCopy = config.targets
    .filter((t) => t.enabled)
    .some((t) => effectiveAction(config.mode, t) === "copy");

  // Quantas recodificações simultâneas a placa aguenta (heurística dos encoders).
  const maxHw = Math.max(
    0,
    ...encoders.filter((e) => e.available && e.maxSessions != null).map((e) => e.maxSessions!),
  );
  const activeEst = estimate(config);
  const overSessions = maxHw > 0 && activeEst.transcodeCount > maxHw;
  const anyHw = encoders.some((e) => e.available && e.kind !== "software");

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        kicker="Como a corneta toca"
        title="Qualidade"
        subtitle="Quantas vezes o vídeo é recodificado — e quanto a sua máquina vai suar. Cada modo mostra o custo de CPU e de upload."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {MODES.map((m) => {
          const est = estimate({ ...config, mode: m.id });
          const active = config.mode === m.id;
          const Icon = m.icon;
          return (
            <motion.button
              key={m.id}
              onClick={() => setMode(m.id)}
              whileTap={{ scale: 0.97 }}
              aria-pressed={active}
              className={cn(
                "relative flex flex-col rounded-lg p-4 text-left transition-all",
                active
                  ? "border-2 border-brass bg-surface pop-brass"
                  : "border-2 border-transparent bg-surface-2 hover:bg-surface-3",
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-md",
                    active ? "bg-brass text-brass-ink" : "bg-surface text-ink-muted",
                  )}
                >
                  <Icon className="size-5" strokeWidth={2.3} />
                </span>
                <Badge tone={m.tone}>{m.tag}</Badge>
              </div>
              <div className="font-display text-lg font-bold">{m.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">{m.desc}</p>
              <div className="mt-3 space-y-2">
                <LoadBar load={est.load} />
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-faint">Upload</span>
                  <span className="font-display font-extrabold tabular-nums">
                    {fmtBitrate(est.uploadKbps)}
                  </span>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {overSessions && (
        <Card className="mt-4 flex gap-3 border-2 border-bad/40 bg-bad/10">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" />
          <p className="text-sm text-ink-muted">
            Este modo pede <strong className="text-ink">{activeEst.transcodeCount} recodificações</strong>{" "}
            ao mesmo tempo, mas a sua placa deve aguentar umas <strong className="text-ink">{maxHw}</strong>.
            Pode falhar no meio da live — use o <strong className="text-ink">Esperto</strong> ou tire uma
            plataforma.
          </p>
        </Card>
      )}

      {hasCopy && lcd.capBy && (
        <Card className="mt-4 flex gap-3 bg-surface-2">
          <Info className="mt-0.5 size-5 shrink-0 text-brass" />
          <p className="text-sm text-ink-muted">
            Destinos <strong className="text-ink">em cópia</strong> recebem o vídeo do OBS exatamente como saiu — a
            Corneta não mexe na qualidade deles. Ajuste o OBS em{" "}
            <strong className="text-ink">~{fmtBitrate(lcd.videoKbps)}</strong> pra caber no{" "}
            <strong className="text-ink">{lcd.capBy}</strong> (a plataforma mais apertada).
          </p>
        </Card>
      )}

      <div className="mt-7">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
          <Cpu className="size-4" /> O que recodifica nesta máquina
        </h3>
        {encoders.length === 0 ? (
          <Card className="bg-surface-2 text-sm text-ink-muted">Vendo o que esta máquina tem…</Card>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {encoders.map((e) => (
                <span
                  key={e.kind}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-bold",
                    e.available ? "bg-ok/15 text-ok" : "bg-surface-2 text-ink-faint line-through",
                  )}
                >
                  {e.label}
                  {e.available && e.maxSessions ? ` · até ${e.maxSessions} ao mesmo tempo` : ""}
                </span>
              ))}
            </div>
            {!anyHw && (
              <p className="mt-2 text-xs text-ink-faint">
                Sem placa de vídeo compatível por aqui — vai de CPU (x264). Funciona, só pesa mais.
              </p>
            )}
          </>
        )}
      </div>

      {config.mode !== "passthrough" && (
        <div className="mt-7">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <Gauge className="size-4" /> Ajuste fino por plataforma
          </h3>
          {config.targets.some((t) => t.enabled) ? (
            <div className="flex flex-col gap-2">
              {config.targets
                .filter((t) => t.enabled)
                .map((t) => (
                  <PerTargetRow key={t.id} targetId={t.id} />
                ))}
            </div>
          ) : (
            <Card className="bg-surface-2 text-sm text-ink-muted">
              Nenhuma plataforma ativa. Ative uma em <strong className="text-ink">Plataformas</strong> pra
              ajustar a qualidade dela.
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function LoadBar({ load }: { load: number }) {
  const pct = Math.round(load * 100);
  const tone = load > 0.66 ? "bg-bad" : load > 0.33 ? "bg-warn" : "bg-ok";
  const word = load >= 0.95 ? "no limite" : load > 0.66 ? "pega pesado" : load > 0.33 ? "esquenta" : "tranquilo";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-ink-faint">CPU/GPU</span>
        <span className="font-display font-bold tabular-nums text-ink-muted">
          {pct}% · {word}
        </span>
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

function PerTargetRow({ targetId }: { targetId: string }) {
  const config = useStore((s) => s.config)!;
  const updateTarget = useStore((s) => s.updateTarget);
  const encoders = useStore((s) => s.encoders);
  const t = config.targets.find((x) => x.id === targetId)!;
  const preset = PLATFORMS[t.platformId];
  const enc = t.encoding;
  const p = enc.preset ?? preset.recommended;
  const action = effectiveAction(config.mode, t);
  const isVertical = p.height > p.width;
  const [reframing, setReframing] = useState(false);

  const recBr = preset.recommended.videoBitrateKbps;
  const brInvalid = !(p.videoBitrateKbps >= MIN_BR && p.videoBitrateKbps <= MAX_BR);

  const patchPreset = (patch: Partial<typeof p>) =>
    updateTarget(t.id, { encoding: { ...enc, preset: { ...p, ...patch } } });

  // O que o "Automático" vai escolher de verdade (1º hardware disponível, senão software).
  const autoResolved =
    encoders.find((x) => x.available && x.kind !== "software")?.label ??
    encoders.find((x) => x.available)?.label;

  const encoderOptions: SelectOption<EncoderKind>[] = [
    { value: "auto", label: "Automático" },
    ...encoders.filter((x) => x.available).map((x) => ({ value: x.kind, label: x.label })),
  ];

  return (
    <>
      <Card className="flex flex-wrap items-center gap-x-5 gap-y-3 bg-surface-2 py-3.5">
        {/* Identidade (esquerda, fixa) */}
        <div className="flex min-w-40 items-center gap-3">
          <PlatformGlyph id={t.platformId} size={36} />
          <div>
            <div className="font-display text-sm font-bold">{t.name}</div>
            <div className="text-[11px] text-ink-faint">
              {p.width}×{p.height} · {p.fps}fps
            </div>
          </div>
        </div>

        {/* Controles (direita) */}
        <div className="ml-auto flex flex-wrap items-end justify-end gap-x-4 gap-y-2">
          {config.mode === "hybrid" && (
            <div className="flex h-9 items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
                <input
                  type="checkbox"
                  className="size-4 accent-brass"
                  checked={action === "transcode"}
                  onChange={(e) =>
                    updateTarget(t.id, {
                      encoding: { ...enc, hybridOverride: e.target.checked ? "transcode" : "copy" },
                    })
                  }
                />
                Recodificar
              </label>
              {enc.hybridOverride === undefined ? (
                <Badge tone="neutral">auto</Badge>
              ) : (
                <button
                  onClick={() => updateTarget(t.id, { encoding: { ...enc, hybridOverride: undefined } })}
                  className="text-[11px] font-semibold text-brass hover:underline"
                >
                  voltar ao auto
                </button>
              )}
            </div>
          )}

          {action === "transcode" ? (
            <>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-faint">
                <span className="flex items-center gap-1">
                  Bitrate (kbps)
                  <Hint text="Dados por segundo: mais bitrate = imagem melhor, mas exige mais upload. ~6000 para 1080p." />
                  <button
                    type="button"
                    onClick={() => patchPreset({ videoBitrateKbps: recBr })}
                    className="font-bold text-brass hover:underline"
                    title="Usar o recomendado"
                  >
                    rec {recBr}
                  </button>
                </span>
                <input
                  type="number"
                  step={500}
                  value={p.videoBitrateKbps}
                  onChange={(e) => patchPreset({ videoBitrateKbps: Number(e.target.value) })}
                  aria-invalid={brInvalid || undefined}
                  className={cn(
                    "h-9 w-28 rounded-md border-2 bg-surface px-2 text-sm tabular-nums outline-none focus:border-brass",
                    brInvalid ? "border-bad focus:border-bad" : "border-border",
                  )}
                />
                {brInvalid && (
                  <span className="font-medium text-bad">entre {MIN_BR} e {MAX_BR}</span>
                )}
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-faint">
                <span className="flex items-center gap-1">
                  Encoder
                  <Hint text="Encoder é quem recodifica o vídeo. Hardware (a placa: NVENC/QSV) poupa a CPU. Software (x264) usa a CPU e entrega a melhor imagem, mas pesa mais." />
                </span>
                <Select
                  className="w-44"
                  aria-label={`Encoder de ${t.name}`}
                  value={enc.encoder}
                  options={encoderOptions}
                  onChange={(v) => updateTarget(t.id, { encoding: { ...enc, encoder: v } })}
                />
                {enc.encoder === "auto" && autoResolved && (
                  <span className="font-normal text-ink-faint">usa {autoResolved}</span>
                )}
              </label>
              {isVertical && (
                <Button variant="outline" size="sm" className="h-9" onClick={() => setReframing(true)}>
                  <Crosshair className="size-3.5 text-brass" /> Enquadrar 9:16
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() =>
                  updateTarget(t.id, { encoding: { ...enc, preset: { ...preset.recommended } } })
                }
              >
                <RotateCcw className="size-3.5" /> Recomendado
              </Button>
            </>
          ) : (
            <div className="flex h-9 items-center">
              <Badge tone="neutral">cópia · sem recodificar</Badge>
            </div>
          )}
        </div>
      </Card>
      <AnimatePresence>
        {reframing && <ReframeEditor target={t} onClose={() => setReframing(false)} />}
      </AnimatePresence>
    </>
  );
}
