import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, ScrollText, X } from "lucide-react";
import { cn } from "../lib/utils";
import { acceptedCurrent, recordAcceptance } from "../lib/legal";
import { PLATFORMS } from "../lib/platforms";
import { INGEST_URL_RE } from "../lib/validation";
import { useStore } from "../lib/store";
import { toast } from "../lib/toast";
import type { PlatformId } from "../lib/types";
import { LegalAcceptNote } from "./legal";
import { Modal } from "./Modal";
import { Mascot, SoundWaves } from "./decor";
import { Button } from "./ui";

const FLAG = "corneta.welcomed";

/**
 * Plataformas oferecidas no passo 2.
 *
 * Filtro derivado, não lista fixa: só entram as que têm endereço de ingest real
 * e página de chave — ou seja, aquelas em que "marcar e colar a chave" basta. As
 * experimentais (TikTok, X, Instagram) exigem que o usuário descubra e informe a
 * própria URL RTMP, o que é conversa pra tela Plataformas, com as ressalvas que
 * ela já mostra. Se um preset amadurecer em platforms.ts, aparece aqui sozinho.
 */
const PICKABLE = Object.values(PLATFORMS).filter(
  (p) => !p.experimental && p.keyUrl && INGEST_URL_RE.test(p.ingestUrl),
);
const PICKER_STEP = 1;

const STEPS = [
  {
    title: "Uma live, todo lugar",
    text: "Você manda 1 stream do OBS e a Corneta espalha pra Twitch, YouTube, Kick e mais — tudo de uma vez.",
  },
  {
    title: "Escolha as plataformas",
    text: "Cada plataforma vira um destino com a sua própria chave de transmissão — é só colar a de cada uma.",
  },
  {
    title: "Liga no OBS",
    text: "Em Ao vivo, o botão “Configura pra mim” acerta o OBS sozinho — sem mexer em menu técnico.",
  },
  {
    title: "Solta a corneta",
    text: "Um clique e você entra no ar em todas. Acompanhe os números de cada plataforma.",
  },
  {
    title: "Chat e relatórios",
    text: "Todo o chat num lugar e, ao encerrar, um relatório do que travou.",
  },
];

/** Qual modal está na tela: o tour de boas-vindas, o reaviso dos termos, ou nada. */
type Flow = "tour" | "reaccept" | null;

function initialFlow(): Flow {
  let welcomed = false;
  try {
    welcomed = localStorage.getItem(FLAG) === "1";
  } catch {
    // Na dúvida, mostra: inofensivo pro veterano, essencial pro novato.
  }
  if (!welcomed) return "tour";
  // Já viu o tour, mas os termos mudaram de forma material desde então.
  return acceptedCurrent() ? null : "reaccept";
}

export function Onboarding({ onStart }: { onStart: () => void }) {
  const [flow, setFlow] = useState<Flow>(initialFlow);
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;

  // O seletor só aparece com a config intocada. Quem já colou uma chave (ou
  // voltou pelo "Rever o tour") vê o passo 2 explicativo de sempre, e nada na
  // config dele é mexido.
  const config = useStore((s) => s.config);
  const setPlatforms = useStore((s) => s.setPlatforms);
  const pristine = !!config && config.targets.every((t) => !t.hasKey);
  const [selected, setSelected] = useState<Set<PlatformId>>(
    () => new Set<PlatformId>(["twitch", "youtube"]),
  );
  const touched = useRef(false);
  // Enquanto o usuário não mexer, o seletor espelha a config (que chega async).
  useEffect(() => {
    if (touched.current || !config) return;
    const ids = config.targets
      .map((t) => t.platformId)
      .filter((id) => PICKABLE.some((p) => p.id === id));
    if (ids.length > 0) setSelected(new Set(ids));
  }, [config]);

  const toggle = (id: PlatformId) => {
    touched.current = true;
    setSelected((prev) => {
      const next = new Set(prev);
      // Sempre pelo menos uma: sem destino nenhum a tela seguinte não faz sentido.
      if (next.has(id)) {
        if (next.size === 1) return prev;
        next.delete(id);
      } else next.add(id);
      return next;
    });
  };

  // "Rever o tour" (a partir de Sobre): reabre no passo 1.
  const replayNonce = useStore((s) => s.tourNonce);
  useEffect(() => {
    if (replayNonce > 0) {
      setStep(0);
      setFlow("tour");
    }
  }, [replayNonce]);

  const close = (start: boolean) => {
    let firstTime = false;
    try {
      firstTime = localStorage.getItem(FLAG) !== "1";
      localStorage.setItem(FLAG, "1");
    } catch {
      /* ignore */
    }
    // Dispensar este modal É entrar no app, e o aviso de aceite esteve na tela
    // o tempo todo — em qualquer caminho de saída. Por isso registra aqui, e não
    // só no "Bora começar".
    recordAcceptance();
    // Vale também pra quem pulou: a seleção começa espelhando a config, então
    // sem mexer no seletor isso não muda nada. A ordem sai de PICKABLE pra os
    // destinos nascerem sempre na mesma sequência.
    if (pristine)
      setPlatforms(PICKABLE.filter((p) => selected.has(p.id)).map((p) => p.id));
    setFlow(null);
    if (start) onStart();
    // Só na primeira dispensa — quem reabriu via Sobre já sabe o caminho.
    else if (firstTime && replayNonce === 0)
      toast.info("Sem pressa — o tour fica em Sobre → Rever o tour.");
  };
  const next = () => (last ? close(true) : setStep((s) => s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const cur = STEPS[step];
  const isPicker = pristine && step === PICKER_STEP;

  if (flow === null) return null;
  if (flow === "reaccept")
    return (
      <LegalUpdate
        onClose={() => {
          recordAcceptance();
          setFlow(null);
        }}
      />
    );
  return (
    <Modal
      title="Opa! Bora cornetar?"
      onClose={() => close(false)}
      className="max-w-md overflow-hidden rounded-xl bg-surface pop"
    >
      <SoundWaves className="pointer-events-none absolute -right-10 -top-10 size-48 text-brass/15" />
      <button
        onClick={() => close(false)}
        aria-label="Pular o tour"
        className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-md text-brass-ink/70 transition-colors hover:bg-brass-ink/10 hover:text-brass-ink"
      >
        <X className="size-5" />
      </button>
      <div className="bg-brass px-6 py-7 text-brass-ink">
        <div className="mb-3 grid size-14 rotate-[-4deg] place-items-center rounded-lg bg-brass-ink text-brass pop">
          <Mascot className="size-8 animate-shout" />
        </div>
        <h2 id="onb-title" className="text-3xl">
          Opa! Bora cornetar?
        </h2>
        <p className="mt-1 text-sm font-semibold opacity-80">
          Em {STEPS.length} passos você manda bem.
        </p>
      </div>

      <div className="p-6">
        <div className="min-h-56">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
          >
            {isPicker ? (
              <>
                <div className="font-display text-lg font-extrabold">
                  Onde você transmite?
                </div>
                <div className="mt-0.5 text-sm leading-relaxed text-ink-muted">
                  Marque onde você faz live e a Corneta já deixa os destinos
                  prontos — depois é só colar a chave de cada um.
                </div>
                <PlatformPicker selected={selected} onToggle={toggle} />
              </>
            ) : (
              <>
                <StepArt step={step} />
                <div className="font-display text-lg font-extrabold">
                  {cur.title}
                </div>
                <div className="mt-0.5 text-sm leading-relaxed text-ink-muted">
                  {cur.text}
                </div>
              </>
            )}
          </motion.div>
        </div>

        <div className="my-4 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              aria-label={`Passo ${i + 1}`}
              className={cn(
                "h-2 rounded-full transition-[width,background-color]",
                i === step
                  ? "w-5 bg-brass"
                  : "w-2 bg-surface-3 hover:bg-border",
              )}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          {step > 0 ? (
            <button
              onClick={back}
              className="flex items-center gap-1 text-sm font-semibold text-ink-faint hover:text-ink-muted"
            >
              <ArrowLeft className="size-4" /> Voltar
            </button>
          ) : (
            <button
              onClick={() => close(false)}
              className="text-sm font-semibold text-ink-faint hover:text-ink-muted"
            >
              Pular
            </button>
          )}
          <Button variant="primary" size="lg" onClick={next}>
            {last ? "Bora começar" : "Próximo"}{" "}
            <ArrowRight className="size-5" />
          </Button>
        </div>

        <LegalAcceptNote className="mt-4 border-t-2 border-border pt-3" />
      </div>
    </Modal>
  );
}

/** Grade de plataformas do passo 2 — o único passo do tour que MUDA alguma coisa. */
function PlatformPicker({
  selected,
  onToggle,
}: {
  selected: Set<PlatformId>;
  onToggle: (id: PlatformId) => void;
}) {
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {PICKABLE.map((p) => {
          const on = selected.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(p.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border-2 px-3 py-2.5 text-left transition-colors",
                on
                  ? "border-brass bg-brass/10"
                  : "border-border bg-surface-2 hover:border-brass/50",
              )}
            >
              <span
                className="grid size-5 shrink-0 place-items-center rounded-md"
                style={{ backgroundColor: p.color }}
              >
                {on && (
                  <Check className="size-3.5 text-white" strokeWidth={3.4} />
                )}
              </span>
              <span
                className={cn(
                  "font-display text-sm font-extrabold",
                  !on && "text-ink-muted",
                )}
              >
                {p.name}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
        Dá pra mudar depois. TikTok, X e qualquer RTMP seu ficam na tela
        Plataformas.
      </p>
    </>
  );
}

/**
 * Os termos mudaram de forma material (`LEGAL_ACCEPT_VERSION` subiu) e este
 * usuário já tinha aceitado uma versão anterior. Avisa UMA vez, sem arrastar o
 * veterano pelos cinco passos do tour de novo.
 */
function LegalUpdate({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Os termos mudaram"
      onClose={onClose}
      className="max-w-md overflow-hidden rounded-xl bg-surface pop"
    >
      <SoundWaves className="pointer-events-none absolute -right-10 -top-10 size-48 text-brass/15" />
      <div className="bg-brass px-6 py-6 text-brass-ink">
        <div className="mb-3 grid size-14 rotate-[-4deg] place-items-center rounded-lg bg-brass-ink text-brass pop">
          <ScrollText className="size-8" />
        </div>
        <h2 className="text-3xl">Os termos mudaram</h2>
      </div>

      <div className="p-6">
        <p className="text-sm leading-relaxed text-ink-muted">
          A gente atualizou os Termos de Uso e a Política de Privacidade. Dá uma
          olhada no que mudou — seguir usando a Corneta significa aceitar a
          versão nova.
        </p>

        <LegalAcceptNote className="mt-4 border-t-2 border-border pt-3" />

        <div className="mt-5 flex justify-end">
          <Button variant="primary" size="lg" onClick={onClose}>
            Entendi <ArrowRight className="size-5" />
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Ilustrações dos passos (mini-painéis de quadrinho) ----------------
// Vocabulário: latão = seu sinal/destinos, tomate = ação/destaque, brass-ink = contorno
// duro. Passo 1 (leque 1→muitos) e passo 5 (funil muitos→1) são imagem espelhada.

const BRASS = "var(--color-brass)";
const TOMATE = "var(--color-tomate)";
const INK = "var(--color-brass-ink)";

/** Chip de plataforma (círculo de latão com a letra). */
function PChip({ cx, cy, label }: { cx: number; cy: number; label: string }) {
  return (
    <>
      <circle
        cx={cx}
        cy={cy}
        r="12"
        fill={BRASS}
        stroke={INK}
        strokeWidth="1.5"
      />
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fontSize="12"
        fontWeight="800"
        fill={INK}
      >
        {label}
      </text>
    </>
  );
}

function ArtFanout() {
  return (
    <svg viewBox="0 0 260 104" className="h-full w-full" aria-hidden>
      <g stroke={BRASS} strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M84 52 H120" />
        <path d="M120 52 C152 52 152 28 196 28" />
        <path d="M120 52 H196" />
        <path d="M120 52 C152 52 152 76 196 76" />
      </g>
      <rect
        x="20"
        y="38"
        width="60"
        height="28"
        rx="6"
        fill={BRASS}
        stroke={INK}
        strokeWidth="2"
      />
      <text
        x="50"
        y="56"
        textAnchor="middle"
        fontSize="14"
        fontWeight="800"
        fill={INK}
      >
        OBS
      </text>
      <circle
        cx="78"
        cy="36"
        r="10"
        fill={TOMATE}
        stroke={INK}
        strokeWidth="1.5"
      />
      <text
        x="78"
        y="40"
        textAnchor="middle"
        fontSize="11"
        fontWeight="800"
        fill="#fff"
      >
        1
      </text>
      <PChip cx={208} cy={28} label="T" />
      <PChip cx={208} cy={52} label="Y" />
      <PChip cx={208} cy={76} label="K" />
    </svg>
  );
}

function ArtKeyVault() {
  return (
    <svg viewBox="0 0 260 104" className="h-full w-full" aria-hidden>
      <rect
        x="18"
        y="32"
        width="92"
        height="26"
        rx="13"
        fill={BRASS}
        stroke={INK}
        strokeWidth="2"
      />
      <text
        x="64"
        y="50"
        textAnchor="middle"
        fontSize="17"
        fontWeight="800"
        fill={INK}
        letterSpacing="3"
      >
        ••••
      </text>
      <text
        x="64"
        y="72"
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        fill="var(--color-ink-faint)"
      >
        sua chave
      </text>
      <g
        stroke={TOMATE}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M118 45 H150" />
        <path d="M143 38 L152 45 L143 52" />
      </g>
      <rect x="166" y="22" width="76" height="62" rx="8" fill={INK} />
      <circle
        cx="204"
        cy="53"
        r="15"
        fill="none"
        stroke={BRASS}
        strokeWidth="3"
      />
      <circle cx="204" cy="53" r="4" fill={BRASS} />
      <rect x="200" y="53" width="8" height="16" fill={BRASS} />
    </svg>
  );
}

function ArtObsSetup() {
  return (
    <svg viewBox="0 0 260 104" className="h-full w-full" aria-hidden>
      <rect
        x="22"
        y="18"
        width="150"
        height="68"
        rx="8"
        fill="none"
        stroke={INK}
        strokeWidth="2.5"
      />
      <g stroke={INK} strokeWidth="3" strokeLinecap="round" opacity="0.3">
        <path d="M38 36 H156" />
        <path d="M38 52 H156" />
        <path d="M38 68 H156" />
      </g>
      <g fill={BRASS} stroke={INK} strokeWidth="2">
        <circle cx="120" cy="36" r="7" />
        <circle cx="120" cy="52" r="7" />
        <circle cx="120" cy="68" r="7" />
      </g>
      <g stroke={TOMATE} strokeWidth="3" strokeLinecap="round">
        <path d="M210 26 v16" />
        <path d="M202 34 h16" />
        <path d="M205 29 l10 10" />
        <path d="M215 29 l-10 10" />
      </g>
      <rect
        x="188"
        y="56"
        width="52"
        height="22"
        rx="5"
        fill={BRASS}
        stroke={INK}
        strokeWidth="2"
      />
      <text
        x="214"
        y="71"
        textAnchor="middle"
        fontSize="9"
        fontWeight="800"
        fill={INK}
      >
        AUTO
      </text>
    </svg>
  );
}

function ArtOnAir() {
  const cols: [string, number][] = [
    ["T", 150],
    ["Y", 192],
    ["K", 234],
  ];
  return (
    <svg viewBox="0 0 260 104" className="h-full w-full" aria-hidden>
      <rect
        x="20"
        y="22"
        width="96"
        height="28"
        rx="6"
        fill={TOMATE}
        stroke={INK}
        strokeWidth="2"
      />
      <circle cx="38" cy="36" r="5" fill="#fff" />
      <text
        x="76"
        y="41"
        textAnchor="middle"
        fontSize="13"
        fontWeight="800"
        fill="#fff"
      >
        NO AR
      </text>
      <path
        d="M20 80 H44 L52 66 L62 92 L72 72 L80 80 H120"
        fill="none"
        stroke={BRASS}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {cols.map(([l, x]) => (
        <g key={l}>
          <PChip cx={x} cy={34} label={l} />
          <g fill={BRASS}>
            <rect x={x - 12} y={66} width={6} height={10} rx={1} />
            <rect x={x - 4} y={60} width={6} height={16} rx={1} />
            <rect x={x + 4} y={54} width={6} height={22} rx={1} />
          </g>
        </g>
      ))}
    </svg>
  );
}

function ArtFunnel() {
  const bubbles: [number, number, string][] = [
    [26, 84, BRASS],
    [46, 72, TOMATE],
    [66, 80, BRASS],
  ];
  return (
    <svg viewBox="0 0 260 104" className="h-full w-full" aria-hidden>
      <PChip cx={28} cy={28} label="T" />
      <PChip cx={28} cy={52} label="Y" />
      <PChip cx={28} cy={76} label="K" />
      <g stroke={BRASS} strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M42 28 C90 28 90 52 130 52" />
        <path d="M42 52 H130" />
        <path d="M42 76 C90 76 90 52 130 52" />
      </g>
      {bubbles.map(([y, w, dot]) => (
        <g key={y}>
          <rect
            x="150"
            y={y}
            width={w}
            height="16"
            rx="6"
            fill="var(--color-surface-3)"
            stroke={INK}
            strokeWidth="1.5"
          />
          <circle cx="158" cy={y + 8} r="3" fill={dot} />
        </g>
      ))}
    </svg>
  );
}

const STEP_ART = [ArtFanout, ArtKeyVault, ArtObsSetup, ArtOnAir, ArtFunnel];

function StepArt({ step }: { step: number }) {
  const Art = STEP_ART[step] ?? ArtFanout;
  return (
    <div className="mb-3 h-28 w-full overflow-hidden rounded-md bg-surface-2 ring-1 ring-border">
      <Art />
    </div>
  );
}
