import { motion } from "framer-motion";
import { Cpu, Gauge, Layers, Sparkles, Wand2, Info, RotateCcw } from "lucide-react";
import { useStore } from "../lib/store";
import type { EncoderKind, EncodingMode } from "../lib/types";
import { PLATFORMS } from "../lib/platforms";
import { estimate, effectiveAction, lowestCommonDenominator } from "../lib/estimates";
import { cn, fmtBitrate } from "../lib/utils";
import { Badge, Button, Card, Hint, PlatformGlyph, SectionTitle } from "../components/ui";
import { Select, type SelectOption } from "../components/Select";

const MODES: {
  id: EncodingMode;
  title: string;
  tag: string;
  icon: typeof Cpu;
  desc: string;
}[] = [
  {
    id: "passthrough",
    title: "Na lata",
    tag: "Mais leve",
    icon: Layers,
    desc: "Encoda uma vez no OBS e copia pra todas. CPU quase zero — todas no mesmo padrão.",
  },
  {
    id: "hybrid",
    title: "Esperto",
    tag: "Recomendado",
    icon: Wand2,
    desc: "Copia onde dá e recodifica só onde precisa (ex.: vertical no TikTok). Decide sozinho.",
  },
  {
    id: "per-platform",
    title: "Caprichado",
    tag: "Máx. qualidade",
    icon: Sparkles,
    desc: "Um encoding sob medida pra cada uma. Melhor imagem, mas o mais pesado (recodifica todas).",
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

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        kicker="Como a corneta toca"
        title="Qualidade"
        subtitle="Decida quantas vezes o vídeo é codificado. Cada modo mostra o custo de CPU e de upload."
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
              className={cn(
                "relative flex flex-col rounded-lg p-4 text-left transition-all",
                active
                  ? "border-2 border-brass bg-surface pop-brass"
                  : "border-2 border-transparent bg-surface-2 hover:bg-surface-3"
              )}
            >
              {m.id === "hybrid" && (
                <span className="absolute -right-2 -top-2.5 rotate-3 rounded-sm bg-brass px-2 py-0.5 font-display text-[11px] font-extrabold uppercase text-brass-ink pop-sm">
                  {m.tag}
                </span>
              )}
              <div className="mb-2 flex items-center justify-between">
                <span className={cn("grid size-9 place-items-center rounded-md", active ? "bg-brass text-brass-ink" : "bg-surface text-ink-muted")}>
                  <Icon className="size-5" strokeWidth={2.3} />
                </span>
                {m.id !== "hybrid" && (
                  <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{m.tag}</span>
                )}
              </div>
              <div className="font-display text-lg font-bold">{m.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">{m.desc}</p>
              <div className="mt-3 space-y-2">
                <LoadBar load={est.load} />
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-faint">Upload</span>
                  <span className="font-display font-extrabold tabular-nums">{fmtBitrate(est.uploadKbps)}</span>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {hasCopy && lcd.capBy && (
        <Card className="mt-4 flex gap-3 bg-surface-2">
          <Info className="mt-0.5 size-5 shrink-0 text-brass" />
          <p className="text-sm text-ink-muted">
            Destinos <strong className="text-ink">em cópia</strong> recebem o stream do OBS como está — a
            Corneta não muda o bitrate deles. Configure o OBS em{" "}
            <strong className="text-ink">~{fmtBitrate(lcd.videoKbps)}</strong> pra caber no{" "}
            <strong className="text-ink">{lcd.capBy}</strong> (o mais apertado).
          </p>
        </Card>
      )}

      <div className="mt-7">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
          <Cpu className="size-4" /> Encoders na máquina
        </h3>
        <div className="flex flex-wrap gap-2">
          {encoders.map((e) => (
            <span
              key={e.kind}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-bold",
                e.available ? "bg-ok/15 text-ok" : "bg-surface-2 text-ink-faint line-through"
              )}
            >
              {e.label}
              {e.available && e.maxSessions ? ` · ${e.maxSessions} sessões` : ""}
            </span>
          ))}
        </div>
      </div>

      {config.mode !== "passthrough" && (
        <div className="mt-7">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <Gauge className="size-4" /> Ajuste fino por plataforma
          </h3>
          {config.targets.some((t) => t.enabled) ? (
            <div className="flex flex-col gap-2">
              {config.targets.filter((t) => t.enabled).map((t) => (
                <PerTargetRow key={t.id} targetId={t.id} />
              ))}
            </div>
          ) : (
            <Card className="bg-surface-2 text-sm text-ink-muted">
              Nenhuma plataforma ativa. Ative uma em <strong className="text-ink">Plataformas</strong> pra ajustar a qualidade dela.
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
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-ink-faint">CPU/GPU</span>
        <span className="font-display font-bold tabular-nums text-ink-muted">{pct}%</span>
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

  const patchPreset = (patch: Partial<typeof p>) =>
    updateTarget(t.id, { encoding: { ...enc, preset: { ...p, ...patch } } });

  const encoderOptions: SelectOption<EncoderKind>[] = [
    { value: "auto", label: "Automático" },
    ...encoders.filter((x) => x.available).map((x) => ({ value: x.kind, label: x.label })),
  ];

  return (
    <Card className="flex flex-wrap items-center gap-x-5 gap-y-3 bg-surface-2 py-3.5">
      {/* Identidade (esquerda, fixa) */}
      <div className="flex min-w-40 items-center gap-3">
        <PlatformGlyph id={t.platformId} size={36} />
        <div>
          <div className="font-display text-sm font-bold">{t.name}</div>
          <div className="text-[11px] text-ink-faint">{p.width}×{p.height} · {p.fps}fps</div>
        </div>
      </div>

      {/* Controles (direita) — quebram limpo e alinham pela base dos campos */}
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
              <Badge className="bg-surface text-ink-faint">auto</Badge>
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
              </span>
              <input
                type="number"
                step={500}
                value={p.videoBitrateKbps}
                onChange={(e) => patchPreset({ videoBitrateKbps: Number(e.target.value) })}
                className="h-9 w-28 rounded-md border-2 border-border bg-surface px-2 text-sm tabular-nums outline-none focus:border-brass"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-faint">
              <span className="flex items-center gap-1">
                Encoder
                <Hint text="Hardware (NVENC/QSV) poupa CPU. Software (x264) tem a melhor qualidade por bit, mas pesa mais." />
              </span>
              <Select
                className="w-44"
                value={enc.encoder}
                options={encoderOptions}
                onChange={(v) => updateTarget(t.id, { encoding: { ...enc, encoder: v } })}
              />
            </label>
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => updateTarget(t.id, { encoding: { ...enc, preset: { ...preset.recommended } } })}
            >
              <RotateCcw className="size-3.5" /> Recomendado
            </Button>
          </>
        ) : (
          <div className="flex h-9 items-center">
            <Badge className="bg-surface text-ink-muted">cópia · sem recodificar</Badge>
          </div>
        )}
      </div>
    </Card>
  );
}
