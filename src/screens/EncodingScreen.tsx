import { motion } from "framer-motion";
import { Cpu, Gauge, Layers, Sparkles, Wand2, Info, RotateCcw } from "lucide-react";
import { useStore } from "../lib/store";
import type { EncoderKind, EncodingMode } from "../lib/types";
import { PLATFORMS } from "../lib/platforms";
import { estimate, effectiveAction, lowestCommonDenominator } from "../lib/estimates";
import { cn, fmtBitrate } from "../lib/utils";
import { Badge, Button, Card, PlatformGlyph, SectionTitle } from "../components/ui";
import { Select, type SelectOption } from "../components/Select";

const MODES: {
  id: EncodingMode;
  title: string;
  tag: string;
  icon: typeof Cpu;
  desc: string;
}[] = [
  {
    id: "per-platform",
    title: "Caprichado",
    tag: "Recomendado",
    icon: Sparkles,
    desc: "Um encoding sob medida pra cada uma (vertical no TikTok, 1080p no YouTube...).",
  },
  {
    id: "passthrough",
    title: "Na lata",
    tag: "Mais leve",
    icon: Layers,
    desc: "Encoda uma vez e copia pra todas. CPU quase zero — todas no mesmo padrão.",
  },
  {
    id: "hybrid",
    title: "Esperto",
    tag: "Híbrido",
    icon: Wand2,
    desc: "Copia onde dá e recodifica só onde precisa. O melhor dos dois mundos.",
  },
];

export function EncodingScreen() {
  const config = useStore((s) => s.config);
  const encoders = useStore((s) => s.encoders);
  const setMode = useStore((s) => s.setMode);
  if (!config) return null;

  const lcd = lowestCommonDenominator(config);

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
              {m.id === "per-platform" && (
                <span className="absolute -right-2 -top-2.5 rotate-3 rounded-sm bg-brass px-2 py-0.5 font-display text-[11px] font-extrabold uppercase text-brass-ink pop-sm">
                  {m.tag}
                </span>
              )}
              <div className="mb-2 flex items-center justify-between">
                <span className={cn("grid size-9 place-items-center rounded-md", active ? "bg-brass text-brass-ink" : "bg-surface text-ink-muted")}>
                  <Icon className="size-5" strokeWidth={2.3} />
                </span>
                {m.id !== "per-platform" && (
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

      {config.mode === "passthrough" && lcd.capBy && (
        <Card className="mt-4 flex gap-3 bg-surface-2">
          <Info className="mt-0.5 size-5 shrink-0 text-brass" />
          <p className="text-sm text-ink-muted">
            No modo <strong className="text-ink">Na lata</strong>, todas recebem o mesmo stream. A gente
            usa <strong className="text-ink">{fmtBitrate(lcd.videoKbps)}</strong> pra caber no{" "}
            <strong className="text-ink">{lcd.capBy}</strong> (o mais apertado). Quer mais qualidade em
            alguma? Vai de <strong className="text-ink">Caprichado</strong>.
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
          <div className="flex flex-col gap-2">
            {config.targets.filter((t) => t.enabled).map((t) => (
              <PerTargetRow key={t.id} targetId={t.id} />
            ))}
          </div>
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
      <div className="flex min-w-40 items-center gap-3">
        <PlatformGlyph id={t.platformId} size={36} />
        <div>
          <div className="font-display text-sm font-bold">{t.name}</div>
          <div className="text-[11px] text-ink-faint">{p.width}×{p.height} · {p.fps}fps</div>
        </div>
      </div>

      {config.mode === "hybrid" && (
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
          <input
            type="checkbox"
            className="size-4 accent-brass"
            checked={enc.action === "transcode"}
            onChange={(e) =>
              updateTarget(t.id, { encoding: { ...enc, action: e.target.checked ? "transcode" : "copy" } })
            }
          />
          Recodificar
        </label>
      )}

      {action === "transcode" ? (
        <>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-faint">
            Bitrate (kbps)
            <input
              type="number"
              step={500}
              value={p.videoBitrateKbps}
              onChange={(e) => patchPreset({ videoBitrateKbps: Number(e.target.value) })}
              className="h-9 w-28 rounded-md border-2 border-border bg-surface px-2 text-sm tabular-nums outline-none focus:border-brass"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-faint">
            Encoder
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
            className="ml-auto self-end"
            onClick={() => updateTarget(t.id, { encoding: { ...enc, preset: { ...preset.recommended } } })}
          >
            <RotateCcw className="size-3.5" /> Recomendado
          </Button>
        </>
      ) : (
        <Badge className="ml-auto bg-surface text-ink-muted">cópia · sem recodificar</Badge>
      )}
    </Card>
  );
}
