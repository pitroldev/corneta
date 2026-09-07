"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { fill } from "@/lib/i18n";
import { PlatformGlyph } from "./decor";
import { RadioIcon } from "./icons";
import { cn, State } from "./ui";

// Prévia ilustrativa: conecta destinos em sequência, sem iniciar transmissão real.
// Com movimento reduzido, a mudança de estado é imediata.

type PlatId = "twitch" | "youtube" | "kick";

const DESTS: { id: PlatId; name: string }[] = [
  { id: "twitch", name: "Twitch" },
  { id: "youtube", name: "YouTube" },
  { id: "kick", name: "Kick" },
];

/** Intervalo entre um destino entrar no ar e o próximo. Não é decoração: é o
 *  "uma por uma" da copy, e num piscar só ninguém vê a ordem. */
const STEP_MS = 650;

export interface GoLiveCopy {
  golive: string;
  stop: string;
  live: string;
  off: string;
  connecting: string;
  /** "no ar · {n} plataformas" */
  onAir: string;
  pick: string;
}

export function GoLive({ copy }: { copy: GoLiveCopy }) {
  const reduce = useReducedMotion() ?? false;
  const [picked, setPicked] = useState<Record<PlatId, boolean>>({
    twitch: true,
    youtube: true,
    kick: true,
  });
  const [phase, setPhase] = useState<"off" | "going" | "live">("off");
  /** Quem já subiu. Lista, não contador: a ordem de subida é a escolhida. */
  const [lit, setLit] = useState<PlatId[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Os temporizadores da subida precisam morrer com o componente — senão um
  // `setState` chega depois da desmontagem e o React reclama, com razão.
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const chosen = DESTS.filter((d) => picked[d.id]).map((d) => d.id);

  const golive = () => {
    if (!chosen.length) return;
    setLit([]);
    if (reduce) {
      setLit(chosen);
      setPhase("live");
      return;
    }
    setPhase("going");
    timers.current = chosen.map((id, i) =>
      setTimeout(
        () => {
          setLit((cur) => [...cur, id]);
          if (i === chosen.length - 1) setPhase("live");
        },
        STEP_MS * (i + 1),
      ),
    );
  };

  const cut = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setLit([]);
    setPhase("off");
  };

  /** Antes de subir dá pra escolher; no ar, mexer na lista mentiria sobre o que
   *  o app faz (lá você corta primeiro). */
  const toggle = (id: PlatId) => {
    if (phase !== "off") return;
    setPicked((cur) => ({ ...cur, [id]: !cur[id] }));
  };

  return (
    <div className="mt-4 rounded-lg bg-surface p-3 text-cream shadow-pop-ink">
      <div className="flex flex-col gap-1.5">
        {DESTS.map((d) => {
          const on = picked[d.id];
          const up = lit.includes(d.id);
          const connecting = phase === "going" && on && !up;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => toggle(d.id)}
              disabled={phase !== "off"}
              aria-pressed={on}
              className={cn(
                "grid min-h-[38px] grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-left",
                "text-[0.78rem] font-bold outline-offset-2 transition-[background-color,opacity] duration-150",
                "[&_.glyph]:h-6 [&_.glyph]:w-6",
                "focus-visible:outline-[3px] focus-visible:outline-brass",
                phase === "off" && "cursor-pointer hover:bg-surface-3",
                !on && "opacity-45",
              )}
            >
              <PlatformGlyph id={d.id} />
              <span>{d.name}</span>
              {/* A `key` é o ESTADO: cada mudança remonta a pastilha e ela entra
                  com um pulinho. É o instante que o painel existe pra mostrar. */}
              <motion.span
                key={up ? "up" : connecting ? "conn" : "off"}
                initial={reduce ? false : { scale: 0.72, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <State tone={up ? "ok" : connecting ? "warn" : "quiet"}>
                  <i
                    className={cn(
                      connecting &&
                        !reduce &&
                        "animate-[soft-pulse_1.1s_ease-in-out_infinite]",
                    )}
                  />{" "}
                  {up ? copy.live : connecting ? copy.connecting : copy.off}
                </State>
              </motion.span>
            </button>
          );
        })}
      </div>

      {phase === "live" ? (
        <button
          type="button"
          onClick={cut}
          className="mt-2.5 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-md border border-border-dry bg-surface-2 font-display text-[0.94rem] font-bold text-muted outline-offset-2 transition-colors duration-150 hover:border-brass hover:text-cream focus-visible:outline-[3px] focus-visible:outline-brass"
        >
          <span className="size-[9px] rounded-sm bg-muted" />
          {copy.stop}
        </button>
      ) : (
        // Sem inclinação: o adesivo torto que ele substitui tinha 120px de
        // largura, e a mesma rotação numa barra que atravessa o painel inteiro
        // lê como erro de alinhamento, não como adesivo. O que fica da
        // linguagem é o gesto de apertar — a sombra afunda em vez de piscar.
        <button
          type="button"
          onClick={golive}
          disabled={!chosen.length || phase === "going"}
          className={cn(
            "mt-2.5 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-md bg-brass",
            "font-display text-[0.94rem] font-extrabold tracking-[0.04em] text-brass-ink uppercase shadow-pop",
            "outline-offset-2 transition-[transform,box-shadow,background-color] duration-90 ease-out",
            "hover:bg-brass-strong active:translate-x-1 active:translate-y-1 active:shadow-none",
            "focus-visible:outline-[3px] focus-visible:outline-brass",
            "[&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:shrink-0",
            "disabled:cursor-default disabled:bg-surface-3 disabled:text-faint-raised disabled:shadow-none",
          )}
          data-on-brass
        >
          <RadioIcon />
          {copy.golive}
        </button>
      )}

      <p className="mt-2 text-center text-[0.62rem] font-bold tracking-[0.04em] text-faint-raised mx-auto">
        {phase === "live"
          ? fill(copy.onAir, { n: String(lit.length) })
          : copy.pick}
      </p>
    </div>
  );
}
