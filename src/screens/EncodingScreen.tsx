import { useState } from "react";
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
import { cn, fmtBitrate, fmtResolution } from "../lib/utils";
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
    desc: "A mesma imagem vai pra todas as plataformas, no mesmo padrão.",
  },
  {
    id: "hybrid",
    title: "Esperto",
    tag: "Recomendado",
    tone: "brass",
    icon: Wand2,
    desc: "Ajusta cada plataforma só onde precisa. Decide sozinho.",
  },
  {
    id: "per-platform",
    title: "Caprichado",
    tag: "Máx. qualidade",
    tone: "neutral",
    icon: Sparkles,
    desc: "Melhor imagem possível pra cada plataforma, mas é o mais pesado.",
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [measuring, setMeasuring] = useState(false);

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
  const verticalCopies = config.targets.filter((t) => {
    const r = PLATFORMS[t.platformId].recommended;
    return t.enabled && r.height > r.width && effectiveAction(config.mode, t) === "copy";
  });
  const verticalNames = verticalCopies.map((t) => t.name);

  const activeFit = bandFit(activeEst.uploadKbps, uploadMbps);
  // Se o Esperto couber na banda (mesmo no limite), é a saída de 1 clique do card vermelho.
  const hybridFit =
    config.mode !== "hybrid"
      ? bandFit(
          estimate({ ...config, mode: "hybrid" }, { anyHwAvailable: anyHw }).uploadKbps,
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
      toast.error("Não consegui medir o upload — sem internet?");
    } finally {
      setMeasuring(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        kicker="Como a corneta toca"
        title="Qualidade"
        subtitle="Quanto capricho na imagem — e quanto sua máquina vai suar."
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
                "relative flex flex-col rounded-lg p-4 text-left transition-all",
                active
                  ? "border-2 border-brass bg-surface pop-brass"
                  : "border-2 border-transparent bg-surface-2 hover:bg-surface-3",
              )}
            >
              {/* Selo em linha própria: dividindo a linha com o título, ele quebrava
                  só no card de título longo e os três ficavam desalinhados. */}
              <Badge tone={m.tone} className="mb-2 self-start">
                {m.tag}
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
                  {m.title}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                {m.desc}
              </p>
              {/* mt-auto: métricas ancoradas no rodapé — descrições de tamanhos
                  diferentes não desalinham as barras entre os três cards. */}
              <div className="mt-auto space-y-2 pt-3">
                <LoadBar load={est.load} />
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-faint">Upload</span>
                  <span className="font-display font-extrabold tabular-nums">
                    {fmtBitrate(est.uploadKbps)}
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
                    ? "cabe folgado na sua banda"
                    : fit === "warn"
                      ? "no limite da sua banda"
                      : fit === "bad"
                        ? "acima da sua banda"
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
        {uploadMbps == null ? (
          <>Ainda não medi sua internet. </>
        ) : (
          <>
            Sua internet sobe{" "}
            <strong className="text-ink-muted">~{uploadMbps} Mbps</strong>.{" "}
          </>
        )}
        {onAir ? (
          <span>A medição fica pra depois da live.</span>
        ) : (
          <button
            type="button"
            onClick={measure}
            disabled={measuring}
            className="font-bold text-brass hover:underline disabled:opacity-60"
          >
            {measuring ? "medindo…" : uploadMbps == null ? "medir agora" : "medir de novo"}
          </button>
        )}
      </p>

      {verticalCopies.length > 0 && (
        <Card className="mt-4 flex gap-3 border-2 border-bad/40 bg-bad/10">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" />
          <div className="flex-1 text-sm text-ink-muted">
            <p>
              {config.mode === "passthrough" ? "Na lata manda" : "Em cópia vai"} o vídeo
              deitado pra{" "}
              <strong className="text-ink">{verticalNames.join(" e ")}</strong>, que só
              aceita{verticalNames.length > 1 ? "m" : ""} vídeo em pé — a live vai sair
              torta ou nem entrar.
            </p>
            {config.mode === "passthrough" ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setMode("hybrid")}
              >
                <Wand2 className="size-3.5 text-brass" /> Usar o Esperto — ele arruma isso
                sozinho
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() =>
                  verticalCopies.forEach((t) =>
                    updateTarget(t.id, {
                      encoding: { ...t.encoding, hybridOverride: undefined },
                    }),
                  )
                }
              >
                <Wand2 className="size-3.5 text-brass" /> Voltar pro Auto — ajusta em pé
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
              Este modo pede{" "}
              <strong className="text-ink">
                {fmtBitrate(activeEst.uploadKbps)}
              </strong>{" "}
              de upload, mas a sua internet mediu{" "}
              <strong className="text-ink">{uploadMbps} Mbps</strong>. Vai
              engasgar no meio da live.
            </p>
            {hybridFits ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setMode("hybrid")}
              >
                <Wand2 className="size-3.5 text-brass" />{" "}
                {hybridFit === "ok"
                  ? "Usar o Esperto — cabe na sua banda"
                  : "Usar o Esperto — fica no limite, mas passa"}
              </Button>
            ) : config.mode === "passthrough" ? (
              // No Na lata a qualidade se define no OBS — mandar pro "ajuste fino"
              // (que aqui diz "não tem o que ajustar") era um beco sem saída.
              <p className="mt-1">
                Baixe a <strong className="text-ink">Taxa de bits no OBS</strong>{" "}
                (
                <button
                  onClick={() => setShowGuide(true)}
                  className="font-bold text-brass hover:underline"
                >
                  ver o guia →
                </button>
                ) ou tire uma plataforma.
              </p>
            ) : (
              <p className="mt-1">
                Baixe a qualidade no{" "}
                <strong className="text-ink">ajuste fino</strong> aqui embaixo
                ou tire uma plataforma.
              </p>
            )}
          </div>
        </Card>
      )}

      {overSessions && (
        <Card className="mt-4 flex gap-3 border-2 border-bad/40 bg-bad/10">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" />
          <p className="text-sm text-ink-muted">
            Este modo pede{" "}
            <strong className="text-ink">
              {activeEst.hwTranscodeCount} recodificações na placa de vídeo
            </strong>{" "}
            ao mesmo tempo, mas ela deve aguentar umas{" "}
            <strong className="text-ink">{maxHw}</strong>. Pode falhar no meio
            da live —{" "}
            {config.mode === "hybrid" ? (
              <>
                volte algumas plataformas pra{" "}
                <strong className="text-ink">Copiar</strong> no ajuste fino, ou
                tire uma plataforma.
              </>
            ) : (
              <>
                use o <strong className="text-ink">Esperto</strong> ou tire uma
                plataforma.
              </>
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
              Plataformas <strong className="text-ink">em cópia</strong> precisam
              do OBS em{" "}
              <strong className="text-ink">~{fmtBitrate(lcd.videoKbps)}</strong>{" "}
              pra caber no <strong className="text-ink">{lcd.capBy}</strong>.
            </p>
          ) : (
            <p>
              Nenhuma plataforma <strong className="text-ink">em cópia</strong>{" "}
              agora: quanto melhor o sinal do OBS, melhor a saída.
            </p>
          )}
          <p className="mt-1 text-xs text-ink-faint">
            No OBS: Configurações → Saída → Taxa de bits.{" "}
            <button
              onClick={() => setShowGuide(true)}
              className="font-bold text-brass hover:underline"
            >
              Ver o guia completo do OBS →
            </button>
          </p>
        </div>
      </Card>

      {showGuide && <ObsQualityGuide onClose={() => setShowGuide(false)} />}

      <div className="mt-7">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
          <Cpu className="size-4" /> O que recodifica nesta máquina
        </h3>
        {encoders.length === 0 ? (
          <Card className="bg-surface-2 text-sm text-ink-muted">
            Vendo o que esta máquina tem…
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
                Sem placa de vídeo por aqui — funciona no processador, só pesa
                mais.
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
          <Gauge className="size-4" /> Ajuste fino por plataforma
          <span className="font-medium normal-case tracking-normal text-ink-faint/70">
            (avançado)
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
              No <strong className="text-ink">Na lata</strong> não tem o que
              ajustar — a qualidade se define no OBS.{" "}
              <button
                onClick={() => setShowGuide(true)}
                className="font-bold text-brass hover:underline"
              >
                Ver o guia do OBS →
              </button>
            </Card>
          ) : config.targets.some((t) => t.enabled) ? (
            <div className="flex flex-col gap-2">
              {config.targets
                .filter((t) => t.enabled)
                .map((t) => (
                  <PerTargetRow key={t.id} targetId={t.id} />
                ))}
            </div>
          ) : (
            <Card className="bg-surface-2 text-sm text-ink-muted">
              Nenhuma plataforma ativa. Ative uma em{" "}
              <strong className="text-ink">Plataformas</strong> pra ajustar a
              qualidade dela.
            </Card>
          ))}
      </div>
    </div>
  );
}

function LoadBar({ load }: { load: number }) {
  const pct = Math.round(load * 100);
  const tone = load > 0.66 ? "bg-bad" : load > 0.33 ? "bg-warn" : "bg-ok";
  const word =
    load >= 0.95
      ? "no limite"
      : load > 0.66
        ? "pega pesado"
        : load > 0.33
          ? "esquenta"
          : "tranquilo";
  // Sem percentual: é heurística, não medição — número exato passaria falsa precisão.
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-ink-faint">
          Peso no PC (estimado)
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

/** Tradução do encoder pra linguagem de gente ("quem faz o trabalho"). */
function friendlyEncoder(x: { kind: EncoderKind; label: string }): string {
  return x.kind === "software"
    ? "Processador (x264)"
    : `Placa de vídeo (${x.label})`;
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
  const recVertical = preset.recommended.height > preset.recommended.width;
  const [reframing, setReframing] = useState(false);
  const [showBrNumber, setShowBrNumber] = useState(false);
  // Rascunho LOCAL do número: commitar a cada tecla fazia os cards de modo e o veredito
  // de banda lá em cima piscarem com valores transitórios ("1" kbps) enquanto digitava.
  const [brDraft, setBrDraft] = useState<string | null>(null);

  const recBr = preset.recommended.videoBitrateKbps;
  const draftNum = brDraft == null ? p.videoBitrateKbps : Number(brDraft);
  const brInvalid = !(
    Number.isFinite(draftNum) && draftNum >= MIN_BR && draftNum <= MAX_BR
  );

  const patchPreset = (patch: Partial<typeof p>) =>
    updateTarget(t.id, { encoding: { ...enc, preset: { ...p, ...patch } } });

  // Paradas do slider RELATIVAS ao recomendado da plataforma (cada uma tem o seu).
  const clampBr = (v: number) =>
    Math.min(MAX_BR, Math.max(MIN_BR, Math.round(v / 100) * 100));
  const stops = [
    { name: "Econômico", kbps: clampBr(recBr * 0.6) },
    { name: "Padrão", kbps: recBr },
    { name: "Bonitão", kbps: clampBr(recBr * 1.4) },
  ];
  const stopIdx = stops.findIndex((s) => s.kbps === p.videoBitrateKbps);

  // O que o "Automático" vai escolher de verdade (1º hardware disponível, senão software).
  const autoEnc =
    encoders.find((x) => x.available && x.kind !== "software") ??
    encoders.find((x) => x.available);
  const autoResolved = autoEnc ? friendlyEncoder(autoEnc) : undefined;

  const encoderOptions: SelectOption<EncoderKind>[] = [
    { value: "auto", label: "Automático" },
    ...encoders
      .filter((x) => x.available)
      .map((x) => ({ value: x.kind, label: friendlyEncoder(x) })),
  ];

  // No híbrido: 3 opções com a decisão do automático resolvida no rótulo.
  const autoAct = smartHybridAction(t.platformId);
  const overrideOpts: { v: EncodingAction | undefined; label: string }[] = [
    {
      v: undefined,
      label: `Auto (${autoAct === "transcode" ? "recodifica" : "copia"})`,
    },
    { v: "transcode", label: "Recodificar" },
    { v: "copy", label: "Copiar" },
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
          <PlatformGlyph id={t.platformId} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-sm font-bold">{t.name}</div>
            <div className="text-[11px] text-ink-faint">
              {/* Em cópia a resolução/fps são as do OBS — mostrar as do preset aqui
                  parecia promessa de "mando 1080p60" que a cópia não cumpre. */}
              {action === "copy"
                ? "resolução e fps: os do OBS"
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
                    key={o.label}
                    type="button"
                    aria-pressed={sel}
                    onClick={() =>
                      updateTarget(t.id, {
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
                    {o.label}
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
                  Qualidade da imagem
                  <Hint text="Imagem melhor pede mais upload. O Padrão é o recomendado da plataforma." />
                </span>
                <div className="flex h-9 w-fit items-center overflow-hidden rounded-md border-2 border-border">
                  {stops.map((s, i) => (
                    <button
                      key={s.name}
                      type="button"
                      aria-pressed={stopIdx === i}
                      title={fmtBitrate(s.kbps)}
                      onClick={() => patchPreset({ videoBitrateKbps: s.kbps })}
                      className={cn(
                        "h-full px-3 text-[11px] font-bold transition-colors",
                        stopIdx === i
                          ? "bg-brass text-brass-ink"
                          : "bg-surface text-ink-muted hover:bg-surface-3",
                      )}
                    >
                      {s.name}
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
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          const clamped =
                            e.target.value.trim() !== "" && Number.isFinite(v)
                              ? Math.min(MAX_BR, Math.max(MIN_BR, Math.round(v)))
                              : recBr;
                          if (clamped !== p.videoBitrateKbps)
                            patchPreset({ videoBitrateKbps: clamped });
                          setBrDraft(null);
                        }}
                        aria-invalid={brInvalid || undefined}
                        aria-label={`Bitrate de ${t.name} em kbps`}
                        className={cn(
                          "h-8 w-24 rounded-md border-2 bg-surface px-2 text-sm tabular-nums outline-none focus:border-brass",
                          brInvalid ? "border-bad focus:border-bad" : "border-border",
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
                        fechar
                      </button>
                      {brInvalid ? (
                        <span className="font-medium text-bad">
                          entre {MIN_BR} e {MAX_BR}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => patchPreset({ videoBitrateKbps: recBr })}
                          className="font-bold text-brass hover:underline"
                        >
                          usar recomendado ({recBr})
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="font-normal text-ink-faint">
                      {stopIdx === -1 ? "personalizado" : stops[stopIdx].name} ·{" "}
                      {fmtBitrate(p.videoBitrateKbps)} ·{" "}
                      <button
                        type="button"
                        onClick={() => setShowBrNumber(true)}
                        className="font-semibold text-brass hover:underline"
                      >
                        ajustar número
                      </button>
                    </span>
                  )}
                </div>
              </div>

              {/* Encoder: coluna fixa à direita, com o "usa X" sempre reservado */}
              <div className="flex flex-col gap-1.5 text-[11px] font-semibold text-ink-faint">
                <span className="flex items-center gap-1">
                  Quem recodifica
                  <Hint text="A placa de vídeo poupa o processador. O processador entrega a melhor imagem, mas pesa mais no PC." />
                </span>
                <Select
                  className="w-52"
                  aria-label={`Quem recodifica em ${t.name}`}
                  value={enc.encoder}
                  options={encoderOptions}
                  onChange={(v) =>
                    updateTarget(t.id, { encoding: { ...enc, encoder: v } })
                  }
                />
                {/* Coluna de largura FIXA (13rem no grid): o "usa X" some ao escolher um
                    encoder explícito, e sem truncate a coluna encolhia deslizando o Select. */}
                <div className="flex h-8 items-center gap-3">
                  <span
                    className="min-w-0 flex-1 truncate font-normal text-ink-faint"
                    title={
                      enc.encoder === "auto" && autoResolved ? `usa ${autoResolved}` : undefined
                    }
                  >
                    {enc.encoder === "auto" && autoResolved ? `usa ${autoResolved}` : " "}
                  </span>
                  {isVertical && (
                    <button
                      type="button"
                      onClick={() => setReframing(true)}
                      className="flex shrink-0 items-center gap-1 font-bold text-brass hover:underline"
                    >
                      <Crosshair className="size-3.5" /> Enquadrar 9:16
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
                <Badge tone="neutral">em cópia</Badge>
                <span className="text-sm font-semibold text-ink">
                  vai exatamente como sai do OBS
                </span>
              </div>
              <p className="text-xs text-ink-muted">
                A qualidade se define no OBS (bitrate, resolução, fps).
              </p>
              {recVertical && (
                <p className="text-[11px] font-bold text-warn">
                  ⚠ em cópia o vídeo vai deitado — {t.name} quer em pé (use
                  “Recodificar”)
                </p>
              )}
            </div>
          )}
        </div>
      </Card>
      <AnimatePresence>
        {reframing && (
          <ReframeEditor target={t} onClose={() => setReframing(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
