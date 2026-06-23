import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, KeyRound, Radio, Split } from "lucide-react";
import { Mascot, SoundWaves } from "./decor";
import { Button } from "./ui";

const FLAG = "corneta.welcomed";

const STEPS = [
  { icon: Split, title: "Uma live, todo lugar", text: "Você manda 1 stream do OBS e a gente espalha pra geral." },
  { icon: KeyRound, title: "Cola as chaves", text: "Guardadas no cofre do sistema — nada de arquivo de texto." },
  { icon: Radio, title: "Solta a corneta", text: "Um clique e você entra no ar em todas de uma vez." },
];

export function Onboarding({ onStart }: { onStart: () => void }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(FLAG) !== "1";
    } catch {
      return false;
    }
  });

  const close = (start: boolean) => {
    try {
      localStorage.setItem(FLAG, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
    if (start) onStart();
  };

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
              <p className="mt-1 text-sm font-semibold opacity-80">
                Transmitir pra todo lugar é mais fácil do que parece.
              </p>
            </div>

            <div className="flex flex-col gap-4 p-6">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={i} className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-brass">
                      <Icon className="size-5" strokeWidth={2.3} />
                    </span>
                    <div>
                      <div className="font-display font-bold">{s.title}</div>
                      <div className="text-sm text-ink-muted">{s.text}</div>
                    </div>
                  </div>
                );
              })}

              <div className="rounded-md bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink-muted">
                💡 No OBS, deixe o <strong className="text-ink">keyframe interval em 2s</strong> e o
                bitrate em <strong className="text-ink">CBR</strong> — quase toda plataforma exige.
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <button
                  onClick={() => close(false)}
                  className="text-sm font-semibold text-ink-faint hover:text-ink-muted"
                >
                  Pular
                </button>
                <Button variant="primary" size="lg" onClick={() => close(true)}>
                  Bora começar <ArrowRight className="size-5" />
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
