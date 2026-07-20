import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { cn } from "../lib/utils";
import { useStore } from "../lib/store";
import { toast } from "../lib/toast";
import { Modal } from "./Modal";
import { Mascot, SoundWaves } from "./decor";
import { Button } from "./ui";

const FLAG = "corneta.welcomed";

const STEPS = [
  {
    title: "Uma live, todo lugar",
    text: "Você manda 1 stream do OBS e a Corneta espalha pra Twitch, YouTube, Kick e mais — tudo de uma vez.",
  },
  {
    title: "Escolha as plataformas",
    text: "A Twitch e o YouTube já estão na lista — é só colar a chave de transmissão de cada um. Quer mais? É só adicionar.",
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

export function Onboarding({ onStart }: { onStart: () => void }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(FLAG) !== "1";
    } catch {
      // Na dúvida, mostra: inofensivo pro veterano, essencial pro novato.
      return true;
    }
  });
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;

  // "Rever o tour" (a partir de Sobre): reabre no passo 1.
  const replayNonce = useStore((s) => s.tourNonce);
  useEffect(() => {
    if (replayNonce > 0) {
      setStep(0);
      setOpen(true);
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
    setOpen(false);
    if (start) onStart();
    // Só na primeira dispensa — quem reabriu via Sobre já sabe o caminho.
    else if (firstTime && replayNonce === 0)
      toast.info("Sem pressa — o tour fica em Sobre → Rever o tour.");
  };
  const next = () => (last ? close(true) : setStep((s) => s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const cur = STEPS[step];

  if (!open) return null;
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
        <div className="min-h-[14rem]">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
          >
            <StepArt step={step} />
            <div className="font-display text-lg font-extrabold">
              {cur.title}
            </div>
            <div className="mt-0.5 text-sm leading-relaxed text-ink-muted">
              {cur.text}
            </div>
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
