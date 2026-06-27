import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, MessageSquare, Radio, Split, Tv2, X, Zap } from "lucide-react";
import { cn } from "../lib/utils";
import { useStore } from "../lib/store";
import { Modal } from "./Modal";
import { Mascot, SoundWaves } from "./decor";
import { Button } from "./ui";

const FLAG = "corneta.welcomed";

const STEPS = [
  {
    icon: Split,
    title: "Uma live, todo lugar",
    text: "Você manda 1 stream do OBS e a Corneta espalha pra Twitch, YouTube, Kick e mais — tudo de uma vez.",
  },
  {
    icon: Tv2,
    title: "Escolha os destinos",
    text: "Em Plataformas, adicione cada lugar e cole a chave de transmissão (aquele código secreto que liga a live à sua conta). As chaves ficam guardadas no cofre do sistema, nunca soltas num arquivo de texto.",
  },
  {
    icon: Zap,
    title: "Liga no OBS",
    text: "Em Ao vivo, o botão “Configura pra mim” ajusta o OBS pra mandar a live pra Corneta sozinho — sem você abrir menu técnico nenhum.",
  },
  {
    icon: Radio,
    title: "Solta a corneta",
    text: "Um clique e você entra no ar em todas. Acompanhe os números de cada plataforma e, pelo ícone lá perto do relógio, veja a saúde geral num olhar.",
  },
  {
    icon: MessageSquare,
    title: "Chat e relatórios",
    text: "Chat unificado de todas as plataformas (com janela flutuante pra um canto) e, ao encerrar, um relatório do que travou.",
  },
];

export function Onboarding({ onStart }: { onStart: () => void }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(FLAG) !== "1";
    } catch {
      return false;
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
    try {
      localStorage.setItem(FLAG, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
    if (start) onStart();
  };
  const next = () => (last ? close(true) : setStep((s) => s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const cur = STEPS[step];
  const Icon = cur.icon;

  if (!open) return null;
  return (
    <Modal
      title="Bora cornetar?"
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
              <h2 id="onb-title" className="text-3xl">Opa! Bora cornetar?</h2>
              <p className="mt-1 text-sm font-semibold opacity-80">
                Em {STEPS.length} passos você manda bem.
              </p>
            </div>

            <div className="p-6">
              <div className="min-h-28">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-start gap-4"
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-surface-2 text-brass">
                      <Icon className="size-6" strokeWidth={2.3} />
                    </span>
                    <div>
                      <div className="font-display text-lg font-extrabold">{cur.title}</div>
                      <div className="mt-0.5 text-sm leading-relaxed text-ink-muted">{cur.text}</div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="my-4 flex justify-center gap-1.5">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    aria-label={`Passo ${i + 1}`}
                    className={cn(
                      "h-2 rounded-full transition-all",
                      i === step ? "w-5 bg-brass" : "w-2 bg-surface-3 hover:bg-border"
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
                  {last ? "Bora começar" : "Próximo"} <ArrowRight className="size-5" />
                </Button>
              </div>
            </div>
    </Modal>
  );
}
