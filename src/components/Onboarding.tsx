import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, MessageSquare, Radio, Split, Tv2, Zap } from "lucide-react";
import { cn } from "../lib/utils";
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
    text: "Em Plataformas, adicione cada lugar e cole a chave. As chaves ficam no cofre do sistema, nunca num arquivo de texto.",
  },
  {
    icon: Zap,
    title: "Liga no OBS",
    text: "Em Ao vivo, o botão “Configurar sozinho” aponta o OBS pra cá. Dica: keyframe 2s + bitrate CBR — quase toda plataforma exige.",
  },
  {
    icon: Radio,
    title: "Solta a corneta",
    text: "Um clique e você entra no ar em todas. Métricas reais por plataforma e o ícone da bandeja mostrando a saúde geral.",
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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] grid place-items-center bg-night/80 p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="relative w-full max-w-md overflow-hidden rounded-xl bg-surface pop"
          >
            <SoundWaves className="pointer-events-none absolute -right-10 -top-10 size-48 text-brass/15" />
            <div className="bg-brass px-6 py-7 text-brass-ink">
              <div className="mb-3 grid size-14 rotate-[-4deg] place-items-center rounded-lg bg-brass-ink text-brass pop">
                <Mascot className="size-8 animate-shout" />
              </div>
              <h2 className="text-3xl">Opa! Bora cornetar?</h2>
              <p className="mt-1 text-sm font-semibold opacity-80">Em 5 passos você manda bem.</p>
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
