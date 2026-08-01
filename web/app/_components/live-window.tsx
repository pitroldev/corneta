"use client";

import { useRef, useState } from "react";
import { fill, group } from "@/lib/i18n";
import { useCalm, useHeartbeat } from "./use-motion";
import { PlatformGlyph } from "./decor";
import { CheckIcon } from "./icons";
import { cn } from "./ui";

// ============================================================
// O miolo VIVO da réplica do herói: o painel "Ao vivo" e o chat reunido.
//
// TESE DE MOTION — uma ideia só: **a janela está no ar agora**. O relógio anda,
// o bitrate oscila, as barrinhas respiram e o chat chega. Não são quatro efeitos
// diferentes; são quatro leituras do mesmo dado em tempo real, que é exatamente
// o que o app mostra. Tirar qualquer uma delas não tira "um enfeite": tira a
// prova de que a Corneta continua trabalhando depois do BORA.
//
// Por que o chat é o único laço que EXISTE por significado e não por energia:
// "chat reunido" é uma alegação que você precisa imaginar enquanto a lista está
// parada. Vendo três plataformas caindo numa coluna só, não precisa imaginar.
//
// ORÇAMENTO. Tudo é transform/opacity e texto; nada de layout. Os dois timers
// param quando a aba fica escondida ou quando a janela sai da tela, porque isto
// mora no primeiro viewport de uma página que a pessoa deixa aberta. Com
// `prefers-reduced-motion` nada roda e o estado final aparece de uma vez.
//
// A divisão servidor/cliente segue o contrato do resto da LP: a copy chega
// RESOLVIDA, porque função não atravessa a fronteira do Next.
// ============================================================

export interface LiveWindowCopy {
  /** Painel */
  kicker: string;
  title: string;
  stateLive: string;
  statUptime: string;
  statSending: string;
  statDrops: string;
  verdict: string;
  stop: string;
  /** "{kbps} kbps · 60 fps · {drops} quedas" — esta linha estava CRAVADA em
   *  português dentro do JSX, junto com um `toLocaleString("pt-BR")`. A página
   *  em inglês mostrava "6.000 kbps · 60 fps · 0 quedas" no primeiro viewport.
   *  O teste de paridade não pegava: a frase nunca entrou em dicionário nenhum. */
  metrics: string;
  /** Separador de milhar do idioma — o número muda a cada segundo, então ele
   *  não pode sair de uma frase pronta. */
  sep: string;
  /** Chat */
  chatTitle: string;
  chatPlatforms: string;
  compose: string;
  send: string;
  /** Uma fala: quem, plataforma e texto — já traduzidos. */
  messages: { from: string; who: string; platform: PlatId; text: string }[];
}

type PlatId = "twitch" | "youtube" | "kick";

/** Alvo de bitrate de cada destino. São os mesmos 6000 kbps da conta do app —
 *  a oscilação em volta deles é que é ilustrativa, e é o que um encoder faz. */
const TARGETS: { id: PlatId; name: string; target: number }[] = [
  { id: "twitch", name: "Twitch", target: 6000 },
  { id: "youtube", name: "YouTube", target: 6000 },
  { id: "kick", name: "Kick", target: 6000 },
];

/** Começa em 1h42 e anda: o mesmo tempo que o resto da página usa de exemplo. */
const START_SEC = 1 * 3600 + 42 * 60 + 8;

const clock = (s: number) =>
  [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");

/** Oscilação determinística em volta do alvo. Sem `Math.random` no primeiro
 *  render: valor diferente no servidor e no cliente vira erro de hidratação. */
const wobble = (target: number, tick: number, seed: number) =>
  target +
  Math.round(
    Math.sin((tick + seed * 2.1) * 1.7) * 26 + Math.sin(tick * 0.7 + seed) * 12,
  );

export function LivePanel({ copy }: { copy: LiveWindowCopy }) {
  const calm = useCalm();
  const ref = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  useHeartbeat(ref, 1000, !calm, () => setTick((n) => n + 1));

  const secs = START_SEC + tick;
  const rates = TARGETS.map((t, i) => wobble(t.target, tick, i));
  const totalMbps = (rates.reduce((a, b) => a + b, 0) + 512) / 1000;

  return (
    <div
      ref={ref}
      className="flex min-w-0 flex-col gap-3.5 p-[18px] max-[760px]:p-[15px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="mb-[5px] block text-[0.6rem] font-extrabold tracking-[0.16em] text-brass uppercase">
            {copy.kicker}
          </span>
          <strong className="block font-display text-2xl leading-[1.05] font-extrabold tracking-[-0.02em]">
            {copy.title}
          </strong>
        </div>
        {/* O ponto AO VIVO é o único pulso que o design system já autorizava. */}
        <span className="flex shrink-0 items-center gap-2 rounded-sm bg-live px-2.5 py-1.5 text-[0.62rem] font-extrabold tracking-[0.1em] text-white uppercase shadow-pop">
          <i
            className={cn(
              "size-[7px] rounded-full bg-white",
              !calm && "animate-[live-pulse_1.4s_ease-out_infinite]",
            )}
          />
          {copy.stateLive}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 max-[760px]:grid-cols-2 max-[760px]:[&>div:last-child]:col-span-2">
        <Stat label={copy.statUptime} value={clock(secs)} />
        <Stat
          label={copy.statSending}
          value={`${totalMbps.toFixed(1).replace(".", ",")} Mb/s`}
        />
        <Stat label={copy.statDrops} value="0" tone="ok" />
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {TARGETS.map((target, i) => (
          <div
            className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-[11px] rounded-md bg-surface-2 px-[11px] py-[9px] [&_.glyph]:h-[38px] [&_.glyph]:w-[38px]"
            key={target.id}
          >
            <PlatformGlyph id={target.id} />
            <div className="min-w-0">
              <strong className="block font-display text-[0.92rem] leading-[1.1] font-bold">
                {target.name}
              </strong>
              <small className="mt-0.5 block text-[0.62rem] font-[550] text-faint-raised tabular-nums">
                {fill(copy.metrics, {
                  kbps: group(rates[i], copy.sep),
                  drops: "0",
                })}
              </small>
            </div>
            <span className="flex items-center gap-2.5">
              <Meter value={rates[i] - target.target} />
              <span className="flex items-center gap-1.5 text-[0.62rem] font-extrabold tracking-[0.04em] text-ok uppercase max-[860px]:hidden">
                <i className="size-[7px] rounded-full bg-ok" />
                {copy.stateLive}
              </span>
            </span>
          </div>
        ))}
      </div>

      <p
        className={cn(
          "flex items-center gap-2 border-t border-border-soft pt-3 text-[0.72rem] leading-[1.4] font-[550] text-muted",
          "[&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:shrink-0 [&>svg]:stroke-ok [&>svg]:[stroke-width:3] [&>svg]:fill-none [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round]",
        )}
      >
        <CheckIcon />
        {copy.verdict}
      </p>

      {/* "Cortar transmissão" é discreto de propósito, e não só por estética: o
          BORA em tomate ficava a 44px do botão de download da página, que é a
          ÚNICA ação real do primeiro viewport. Com a live já no ar, o tomate
          volta a ter um dono só. */}
      <div className="flex min-h-[44px] items-center justify-center gap-2.5 rounded-md border border-border-dry bg-surface-2 font-display text-[0.98rem] font-bold text-muted">
        <span className="size-[9px] rounded-sm bg-muted" />
        {copy.stop}
      </div>
    </div>
  );
}

/**
 * Medidor de sinal do destino — cinco tracinhos que respiram com o bitrate.
 *
 * A primeira versão era uma barra cheia de largura total em ~90%. Ela lia como
 * "carregando 90%", que é o oposto do que a peça diz: o número é a SAÚDE de uma
 * conexão estável, não o progresso de alguma coisa. Cinco segmentos curtos
 * dizem "sinal", e o último acende/apaga conforme a oscilação — o único
 * movimento que sobra é o que carrega informação.
 */
function Meter({ value }: { value: number }) {
  // Oscila ~±38 kbps em volta do alvo; abaixo de -12 o último tracinho apaga.
  const lit = value < -12 ? 4 : 5;
  return (
    <span className="flex items-end gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <i
          key={i}
          className={cn(
            "w-[3px] rounded-[1px] transition-colors duration-500 ease-out",
            i < lit ? "bg-ok" : "bg-surface-3",
          )}
          style={{ height: `${5 + i * 2.5}px` }}
        />
      ))}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok";
}) {
  return (
    <div className="border-t-2 border-brass/55 bg-surface-2 px-[11px] py-2">
      <span className="block text-[0.55rem] font-extrabold tracking-[0.08em] text-faint-raised uppercase">
        {label}
      </span>
      <strong
        className={cn(
          "mt-0.5 block font-display text-[1.06rem] leading-[1.1] font-extrabold tabular-nums",
          tone === "ok" && "text-ok",
        )}
      >
        {value}
      </strong>
    </div>
  );
}

/** O chat chegando. A lista mostra as últimas cinco e anda a cada ~3s. */
export function LiveChat({ copy }: { copy: LiveWindowCopy }) {
  const calm = useCalm();
  const ref = useRef<HTMLDivElement>(null);
  const [head, setHead] = useState(0);
  useHeartbeat(ref, 3000, !calm, () => setHead((n) => n + 1));

  const n = copy.messages.length;
  // Janela deslizante sobre a lista: sempre cinco, sempre em ordem de chegada.
  const shown = Array.from({ length: 6 }, (_, i) => {
    const idx = (head + i) % n;
    return { ...copy.messages[idx], key: `${head + i}` };
  });

  return (
    <div
      ref={ref}
      className="flex min-w-0 flex-col border-l border-border-soft bg-panel px-[15px] py-[18px] max-[1180px]:hidden"
      aria-hidden="true"
    >
      <div className="mb-4 flex items-start justify-between gap-2.5">
        <span>
          <strong className="block font-display text-[0.9rem] leading-none font-bold">
            {copy.chatTitle}
          </strong>
          <small className="mt-[3px] block text-[0.56rem] font-bold tracking-[0.08em] text-faint uppercase">
            {copy.chatPlatforms}
          </small>
        </span>
      </div>

      {/* `overflow-hidden` + `justify-end`: as falas se acumulam de baixo pra
          cima e a mais velha é cortada na borda de cima, como num chat de
          verdade. Sem o corte, a entrada de uma nova empurraria a coluna e
          mexeria na altura da janela inteira. */}
      {/* O desvanecer do topo é MÁSCARA, não opacidade por item: o `both` da
          animação de entrada fixa opacity:1 no fim e engolia qualquer classe de
          opacidade que eu pusesse na fala mais velha. A máscara não disputa. */}
      <div className="flex flex-1 flex-col justify-end gap-[13px] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_38px)]">
        {shown.map((m) => (
          <div
            key={m.key}
            className={cn(
              "grid grid-cols-[24px_minmax(0,1fr)] gap-2 [&_.glyph]:h-6 [&_.glyph]:w-6",
              !calm &&
                "animate-[chat-in_420ms_cubic-bezier(0.16,1,0.3,1)_both]",
            )}
          >
            <PlatformGlyph id={m.platform} />
            <div>
              <strong className="block text-[0.6rem] font-extrabold text-muted">
                {m.from} · {m.who}
              </strong>
              <p className="mt-0.5 text-[0.72rem] leading-[1.4] font-[550]">
                {m.text}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3.5 flex min-h-[34px] items-center justify-between gap-2 rounded-md border border-border-dry px-2.5 text-[0.62rem] font-[550] text-faint">
        {copy.compose}
        <b className="text-brass">{copy.send}</b>
      </div>
    </div>
  );
}
