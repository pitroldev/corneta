import { useEffect, useState } from "react";
import { Check, ChevronRight, Radio, X } from "lucide-react";
import { useStore } from "../lib/store";
import { cn } from "../lib/utils";

const FLAG = "corneta.firstlive";

function flagDone(): boolean {
  try {
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

function setFlagDone() {
  try {
    localStorage.setItem(FLAG, "1");
  } catch {
    /* ignore */
  }
}

/**
 * "Sua 1ª live em 3 passos" — o guia persistente que o tour não é: fica no topo de
 * Plataformas e Ao vivo até a primeira live acontecer (ou o veterano dispensar), com cada
 * passo clicável levando pro lugar certo. Fecha o buraco entre "fechei o tour" e "tô no ar".
 */
export function FirstLiveChecklist({ onSetupObs }: { onSetupObs?: () => void }) {
  const config = useStore((s) => s.config);
  const obs = useStore((s) => s.obs);
  const runObsCheck = useStore((s) => s.runObsCheck);
  const requestNavigate = useStore((s) => s.requestNavigate);
  const state = useStore((s) => s.snapshot.state);
  const [hidden, setHidden] = useState(flagDone);

  // Entrou no ar = missão cumprida: grava e some pra sempre (o resto da tela assume).
  useEffect(() => {
    if (!hidden && state === "live") {
      setFlagDone();
      setHidden(true);
    }
  }, [state, hidden]);

  useEffect(() => {
    if (!hidden) void runObsCheck();
  }, [hidden, runObsCheck]);

  if (hidden || !config) return null;

  const keyOk = config.targets.some((t) => t.enabled && t.hasKey);
  const obsOk = obs !== null && obs !== "loading" && obs.reachable && obs.pointingAtCorneta;

  const steps: { label: string; done: boolean; onClick: () => void }[] = [
    {
      label: "Cole a chave de uma plataforma",
      done: keyOk,
      onClick: () => requestNavigate("platforms"),
    },
    {
      label: "Conecte o OBS",
      done: obsOk,
      onClick: () => {
        if (onSetupObs) onSetupObs();
        else requestNavigate("golive");
      },
    },
    {
      label: "BORA AO VIVO",
      done: false,
      onClick: () => requestNavigate("golive"),
    },
  ];

  return (
    <div className="mb-4 rounded-lg border-2 border-brass/40 bg-brass/[0.06] px-4 py-3">
      <div className="flex items-center gap-2">
        <Radio className="size-4 text-brass" strokeWidth={2.6} />
        <span className="font-display text-sm font-extrabold">Sua 1ª live em 3 passos</span>
        <button
          onClick={() => {
            setFlagDone();
            setHidden(true);
          }}
          aria-label="Dispensar o guia"
          title="Já sei me virar"
          className="ml-auto grid size-6 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
        {steps.map((s, i) => (
          <button
            key={s.label}
            onClick={s.onClick}
            className={cn(
              "group flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-surface-2",
              s.done ? "text-ink-faint" : "text-ink",
            )}
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full border-2 text-[11px] font-extrabold",
                s.done
                  ? "border-ok bg-ok text-night"
                  : "border-brass text-brass",
              )}
            >
              {s.done ? <Check className="size-3.5" strokeWidth={3.2} /> : i + 1}
            </span>
            <span className={cn("font-semibold", s.done && "line-through")}>{s.label}</span>
            {!s.done && (
              <ChevronRight className="size-3.5 text-ink-faint transition-transform group-hover:translate-x-0.5" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
