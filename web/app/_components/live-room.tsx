"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { PlatformGlyph } from "./decor";
import { EyeIcon } from "./icons";
import { Chip, cn, DemoLabel, State } from "./ui";
import { useCalm, useHeartbeat, useOnScreen } from "./use-motion";
import { fill, group } from "@/lib/i18n";

// Sala de guerra e relatório: os dois painéis da jornada da live.
//
// ------------------------------------------------------------
// POR QUE ISTO FOI REESCRITO
// ------------------------------------------------------------
// A versão anterior animava a ENTRADA: as barrinhas subiam do zero e a curva se
// desenhava quando a seção aparecia, uma vez só. Dois problemas, e o segundo é
// grave:
//
//  1. Rolando a página normalmente, não havia nada acontecendo. Uma entrada de
//     um segundo que roda uma vez por visita não é um painel vivo — é um GIF
//     que já terminou. E estes dois painéis vendem justamente o que a Corneta
//     faz ENQUANTO a live acontece.
//
//  2. A curva `pathLength` + `vector-effect: non-scaling-stroke` +
//     `preserveAspectRatio="none"` desenhava ERRADO. O framer implementa
//     `pathLength` como `stroke-dasharray`, medida em unidades do usuário; o
//     `non-scaling-stroke` manda o traço ser calculado em pixels de tela; e o
//     `preserveAspectRatio="none"` estica X e Y por fatores diferentes. Os três
//     juntos fazem o tracejado ser calculado numa escala e desenhado noutra: a
//     linha aparecia cortada no meio, ou não aparecia. Foi o "sumiram ou
//     ficaram cortadas" que apareceu na revisão.
//
// A regra que fica: `pathLength` NÃO combina com viewBox esticado. Onde o
// desenho estica, o movimento tem que ser posição/opacidade/clipe — nunca
// tracejado.
//
// ------------------------------------------------------------
// A TESE NOVA: os dois painéis ESTÃO RODANDO
// ------------------------------------------------------------
// Sala de guerra: os números oscilam, a Kick cai e volta sozinha num ciclo, e
// as barras de CPU/placa respondem. E o painel ACEITA COMANDO: clicar num
// destino liga ou pausa ele — e a conta de máquina sobe junto, que é a relação
// que o app mostra de verdade (mais destino convertendo, mais CPU).
//
// Relatório: o gráfico TOCA. Um cursor caminha pela live inteira e a leitura
// embaixo acompanha minuto a minuto; passar o mouse (ou arrastar o dedo) toma o
// controle e vira busca livre. É o mesmo laço da tela de Relatórios do app.
//
// Com `prefers-reduced-motion` nenhum laço roda — os painéis ficam no estado
// inicial e o CLIQUE continua funcionando. Movimento é o que some; função, não.
//
// A copy chega RESOLVIDA (função não atravessa a fronteira servidor→cliente) e
// os números entram por `fill`, então o texto em volta continua no dicionário.

/** `text-cream` explícito: estes painéis aparecem sobre seções de PAPEL, onde a
 *  tinta herdada é escura — sem isso o nome da plataforma some no fundo escuro. */
const PANEL = "rounded-lg bg-surface p-[18px] text-cream shadow-pop-ink-lg";

const ROW =
  "grid w-full grid-cols-[30px_minmax(0,1fr)_auto] max-[760px]:grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md bg-surface-2 px-2.5 py-[9px] text-left not-first:mt-[7px] " +
  "[&_.glyph]:h-[30px] [&_.glyph]:w-[30px] " +
  "[&>div>strong]:block [&>div>strong]:font-display [&>div>strong]:text-[0.84rem] [&>div>strong]:font-bold " +
  "[&>div>small]:mt-0.5 [&>div>small]:block [&>div>small]:text-[0.62rem] [&>div>small]:font-[550] [&>div>small]:tabular-nums [&>div>small]:text-faint-raised";

type PlatId = "twitch" | "youtube" | "kick" | "tiktok";

const ROWS: { id: PlatId; name: string; target: number }[] = [
  { id: "twitch", name: "Twitch", target: 6000 },
  { id: "youtube", name: "YouTube", target: 6000 },
  { id: "kick", name: "Kick", target: 6000 },
  { id: "tiktok", name: "TikTok", target: 4500 },
];

/** A Kick cai e volta sozinha: 10s fora, 16s no ar. O ciclo é o argumento do
 *  painel — não adianta mostrar uma queda congelada, porque o que a Corneta faz
 *  é a RECUPERAÇÃO, e recuperação só existe no tempo. */
const KICK_CYCLE = 26;
const KICK_DOWN = 10;

/** Oscilação determinística em volta do alvo — mesma função da janela do herói.
 *  Sem `Math.random`: valor diferente no servidor e no cliente vira erro de
 *  hidratação. */
const wobble = (target: number, tick: number, seed: number) =>
  target +
  Math.round(
    Math.sin((tick + seed * 2.1) * 1.7) * 26 + Math.sin(tick * 0.7 + seed) * 12,
  );

export interface LiveRoomCopy {
  label: string;
  tag: string;
  /** Template com os buracos do bitrate e das quedas — só os números são do
   *  cliente; o texto em volta continua saindo do dicionário. */
  metrics: string;
  onAir: string;
  reconnecting: string;
  back: string;
  paused: string;
  pausedState: string;
  cpu: string;
  gpu: string;
  /** "{n} assistindo" */
  watching: string;
  hint: string;
  /** Separador de milhar do idioma. Vem resolvido de fora porque o componente
   *  não conhece o locale — e não precisa conhecer. */
  sep: string;
}

export interface ReportChartCopy {
  label: string;
  tag: string;
  chartAria: string;
  scrub: string;
  hint: string;
  watching: string;
  peak: string;
  average: string;
  messages: string;
  raid: string;
  drop: string;
  sep: string;
}

/** Medidor de carga: rótulo, barrinha e número. A barra é `scaleX`, não
 *  `width` — largura reflui a linha inteira a cada segundo. */
function Meter({
  label,
  pct,
  ok = false,
  calm,
}: {
  label: string;
  pct: number;
  ok?: boolean;
  calm: boolean;
}) {
  return (
    <span className="flex items-center gap-[7px] text-[0.66rem] font-extrabold tracking-[0.04em] whitespace-nowrap text-muted uppercase">
      {label}
      <i className="block h-[7px] w-14 overflow-hidden bg-surface-3">
        <motion.b
          className={cn(
            "block h-full w-full origin-left",
            ok ? "bg-ok" : "bg-brass",
          )}
          initial={false}
          animate={{ scaleX: pct / 100 }}
          transition={
            calm ? { duration: 0 } : { type: "spring", stiffness: 130, damping: 21 }
          }
        />
      </i>
      <span className="w-[3.4ch] text-right tabular-nums">{pct}%</span>
    </span>
  );
}

export function LiveRoom({ copy }: { copy: LiveRoomCopy }) {
  const calm = useCalm();
  const box = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  /** O que a PESSOA desligou. A TikTok começa pausada — é o estado que o painel
   *  sempre mostrou; a diferença é que agora dá pra ligar. */
  const [off, setOff] = useState<Partial<Record<PlatId, boolean>>>({
    tiktok: true,
  });

  useHeartbeat(box, 1000, !calm, () => setTick((n) => n + 1));

  const kickPhase = tick % KICK_CYCLE;
  const kickDown = kickPhase < KICK_DOWN;
  // A Kick já caiu uma vez antes do painel abrir: começa em 1, não em 0.
  const kickDrops = Math.floor(tick / KICK_CYCLE) + 1;

  const active = ROWS.filter((r) => !off[r.id]).length;
  // A conta de máquina responde ao que está ligado. Não é enfeite: é a relação
  // que a tela de Qualidade do app mostra, e é o que justifica o painel ter
  // CPU e placa em vez de só bitrate.
  const cpu = 6 + active * 4 + Math.round(Math.sin(tick * 0.9) * 2);
  const gpu = 11 + Math.round(active * 6.7) + Math.round(Math.sin(tick * 0.6 + 1) * 2);
  const viewers = Math.round(
    (1284 + Math.round(Math.sin(tick * 0.33) * 46 + Math.sin(tick * 0.11) * 28)) *
      (active / 3),
  );

  const toggle = (id: PlatId) =>
    setOff((cur) => ({ ...cur, [id]: !cur[id] }));

  return (
    <div ref={box} className={PANEL}>
      <DemoLabel>
        <span>{copy.label}</span>
        <span>{copy.tag}</span>
      </DemoLabel>

      {ROWS.map((row, i) => {
        const isOff = off[row.id];
        const down = !isOff && row.id === "kick" && kickDown;
        const kbps = wobble(row.target, tick, i);
        const state = isOff ? "off" : down ? "down" : "live";

        return (
          <button
            key={row.id}
            type="button"
            onClick={() => toggle(row.id)}
            aria-pressed={!isOff}
            className={cn(
              ROW,
              "cursor-pointer outline-offset-2 transition-colors duration-150",
              "hover:bg-surface-3 focus-visible:outline-[3px] focus-visible:outline-brass",
              isOff && "opacity-70",
            )}
          >
            <PlatformGlyph id={row.id} />
            <div>
              <strong>{row.name}</strong>
              <small>
                {isOff
                  ? copy.paused
                  : down
                    ? fill(copy.reconnecting, { s: String(12 + kickPhase) })
                    : fill(copy.metrics, {
                        kbps: group(kbps, copy.sep),
                        drops: String(row.id === "kick" ? kickDrops : 0),
                      })}
              </small>
            </div>
            {/* A `key` é o ESTADO: quando a Kick volta, a pastilha remonta e
                entra com um pulinho. É o instante que o painel existe pra
                mostrar, e sem a remontagem ele passaria como troca de cor. */}
            <motion.span
              key={state}
              initial={calm ? false : { scale: 0.72, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <State tone={down ? "warn" : isOff ? "quiet" : "ok"}>
                {/* Só a linha que está TENTANDO alguma coisa pulsa. */}
                <i
                  className={cn(
                    down && !calm && "animate-[soft-pulse_1.2s_ease-in-out_infinite]",
                  )}
                />{" "}
                {down ? copy.back : isOff ? copy.pausedState : copy.onAir}
              </State>
            </motion.span>
          </button>
        );
      })}

      <div className="mt-[13px] flex flex-wrap gap-x-4 gap-y-2 border-t-2 border-border-soft pt-[13px]">
        <Meter label={copy.cpu} pct={cpu} calm={calm} />
        <Meter label={copy.gpu} pct={gpu} ok calm={calm} />
        <span className="flex items-center gap-[7px] text-[0.66rem] font-extrabold tracking-[0.04em] whitespace-nowrap text-muted uppercase tabular-nums [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:shrink-0 [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round] [&>svg]:[stroke-width:2.2]">
          <EyeIcon />
          {fill(copy.watching, { n: group(viewers, copy.sep) })}
        </span>
      </div>

      {/* O convite. Sem ele o painel parece uma figura, e ninguém descobre que
          as linhas respondem — affordance que não se anuncia não existe. */}
      <p className="mt-2.5 text-[0.62rem] font-bold tracking-[0.04em] text-faint-raised">
        {copy.hint}
      </p>
    </div>
  );
}

// ============================================================
// Relatório pós-live — a curva de audiência TOCANDO
// ============================================================
// A análise real (src/screens/ReportsScreen.tsx) cruza viewerSamples,
// alertEvents, taxa de chat e janelas com problema; aqui é uma sessão de
// exemplo. O que NÃO é exemplo é o gesto: no app o relatório tem um cursor que
// atravessa todos os gráficos junto, e é ele que está aqui.

/** Audiência a cada 9,6 min de uma live de 3h12. O pico (índice 10) é o raid
 *  das 22:30 e o índice 14 é o trecho com queda de sinal — os dois marcadores
 *  que a legenda embaixo nomeia. */
const SAMPLES = [
  362, 430, 495, 560, 610, 680, 650, 740, 800, 880, 1284, 1160, 1130, 1040,
  1090, 980, 900, 940, 830, 760, 610,
];
const PEAK = 1284;
const LAST = SAMPLES.length - 1;
const W = 360;
const H = 96;
/** Minuto zero da live e duração — o eixo em números, pra leitura do cursor. */
const START_MIN = 21 * 60;
const SPAN_MIN = 192;

const xAt = (i: number) => (i / LAST) * W;
const yOf = (v: number) => 90 - (v / PEAK) * 72;
const CURVE = SAMPLES.map(
  (v, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)},${yOf(v).toFixed(1)}`,
).join(" ");

/** Audiência em qualquer ponto do eixo (0..1), interpolando entre amostras. */
function viewersAt(p: number) {
  const x = Math.max(0, Math.min(LAST, p * LAST));
  const i = Math.min(LAST - 1, Math.floor(x));
  return SAMPLES[i] + (SAMPLES[i + 1] - SAMPLES[i]) * (x - i);
}

/** Relógio de parede naquele ponto — a live vira madrugada, então dá a volta. */
function clockAt(p: number) {
  const total = Math.round(START_MIN + p * SPAN_MIN) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Os dois instantes marcados na curva, em fração do eixo. */
const RAID = 10 / LAST;
const DROP = 14 / LAST;
/** Quão perto o cursor precisa chegar pra "acender" um marcador. */
const NEAR = 0.035;

const GRID =
  "stroke-border-dry [stroke-width:1] [vector-effect:non-scaling-stroke]";

/** Quanto tempo o cursor leva pra atravessar a live inteira, tocando sozinho. */
const SWEEP_MS = 18000;

export function ReportChart({ copy }: { copy: ReportChartCopy }) {
  // Aqui é o `useReducedMotion` do framer, não o `useCalm`: este componente
  // precisa saber a preferência JÁ NO PRIMEIRO EFEITO (pra decidir onde o cursor
  // descansa), e o `useCalm` nasce dizendo "calmo" pra todo mundo.
  const reduce = useReducedMotion() ?? false;
  const box = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(box);
  /** `true` enquanto a pessoa está com o cursor (ou o dedo, ou o foco) em cima.
   *  O passeio automático para: ninguém consegue ler um ponto que foge. */
  const [held, setHeld] = useState(false);

  // ------------------------------------------------------------
  // A POSIÇÃO NÃO É ESTADO DO REACT
  // ------------------------------------------------------------
  // A primeira versão empurrava `setPos` num `setInterval` de 90 ms. Isso não é
  // "uma animação leve": é uma animação de ONZE QUADROS POR SEGUNDO — e foi
  // exatamente assim que ela apareceu na tela, engasgada.
  //
  // Um `MotionValue` mora FORA do ciclo de render: o `useAnimationFrame` empurra
  // o valor a cada quadro e o framer escreve direto no estilo de quem depende
  // dele. Nenhum render do React por quadro, 60 fps.
  //
  // O que continua em estado do React é só o que muda em SALTOS — as pastilhas
  // que acendem e o valor que o leitor de tela anuncia. Isso muda um punhado de
  // vezes por passagem, não sessenta por segundo.
  const pos = useMotionValue(0);

  useAnimationFrame((_, delta) => {
    if (!onScreen || held || reduce) return;
    // `delta` volta gigante quando a aba estava no fundo; sem o teto o cursor
    // daria um salto de meia live no primeiro quadro de volta.
    const next = pos.get() + Math.min(delta, 64) / SWEEP_MS;
    pos.set(next >= 1 ? 0 : next);
  });

  // Com movimento reduzido o cursor não anda — então ele descansa no FIM, com o
  // relatório inteiro lido. Parado no começo, o gráfico apareceria todo apagado
  // pra quem pediu menos movimento, que é o contrário de acessível.
  useEffect(() => {
    if (reduce) pos.set(1);
  }, [reduce, pos]);

  const left = useTransform(pos, (p) => `${p * 100}%`);
  const dotTop = useTransform(pos, (p) => `${(yOf(viewersAt(p)) / H) * 100}%`);
  /** O véu sobre o trecho que o cursor ainda não leu. É `scaleX` num elemento
   *  ancorado à direita — transformação pura, que o compositor resolve sem
   *  refazer layout. A versão anterior fazia isso com um recorte de SVG cujo
   *  `width` só mudava quando o React re-renderizava. */
  const veil = useTransform(pos, (p) => 1 - p);
  const readout = useTransform(
    pos,
    (p) =>
      `${clockAt(p)} · ${fill(copy.watching, {
        n: group(Math.round(viewersAt(p)), copy.sep),
      })}`,
  );

  const [mark, setMark] = useState({ min: 0, raid: false, drop: false });
  useMotionValueEvent(pos, "change", (p) => {
    const raid = Math.abs(p - RAID) < NEAR;
    const drop = Math.abs(p - DROP) < NEAR;
    const min = Math.round(p * SPAN_MIN);
    // Devolver o MESMO objeto é o que corta o render: o React compara por
    // identidade e não reconcilia nada.
    setMark((cur) =>
      cur.raid === raid && cur.drop === drop && Math.abs(cur.min - min) < 4
        ? cur
        : { min, raid, drop },
    );
  });

  /** Posição do ponteiro → fração do eixo. Escreve direto no `MotionValue`:
   *  arrastar não passa pelo React em quadro nenhum. */
  const seek = (clientX: number) => {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    pos.set(Math.max(0, Math.min(1, (clientX - r.left) / r.width)));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step =
      e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowLeft"
          ? -1
          : e.key === "Home"
            ? -99
            : e.key === "End"
              ? 99
              : 0;
    if (!step) return;
    e.preventDefault();
    pos.set(Math.max(0, Math.min(1, pos.get() + step / LAST)));
  };

  const ariaP = mark.min / SPAN_MIN;

  return (
    <div ref={box} className={PANEL}>
      <DemoLabel>
        <span>{copy.label}</span>
        <span>{copy.tag}</span>
      </DemoLabel>

      {/* O quadro do gráfico é o próprio controle: cursor em cima já busca, sem
          exigir clique. `touch-action: pan-y` deixa a página rolar no celular e
          reserva só o arrasto horizontal pra busca. */}
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={copy.scrub}
        aria-valuemin={0}
        aria-valuemax={SPAN_MIN}
        aria-valuenow={mark.min}
        aria-valuetext={`${clockAt(ariaP)} · ${fill(copy.watching, {
          n: group(Math.round(viewersAt(ariaP)), copy.sep),
        })}`}
        onKeyDown={onKeyDown}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setHeld(true);
          seek(e.clientX);
        }}
        onPointerMove={(e) => seek(e.clientX)}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
        className="relative my-1.5 cursor-ew-resize touch-pan-y rounded-sm outline-offset-4 focus-visible:outline-[3px] focus-visible:outline-brass"
      >
        <svg
          className="block h-auto w-full"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={copy.chartAria}
        >
          <line className={GRID} x1="0" y1="24" x2={W} y2="24" />
          <line className={GRID} x1="0" y1="56" x2={W} y2="56" />
          <path className="fill-brass/20" d={`${CURVE} L${W},${H} L0,${H} Z`} />
          <path
            className="fill-none stroke-brass [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2.5] [vector-effect:non-scaling-stroke]"
            d={CURVE}
          />
        </svg>

        {/* O véu entra ANTES das marcas: elas ficam por cima e continuam
            legíveis do outro lado do cursor — é delas que a legenda fala. */}
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 origin-right bg-surface/65"
          style={{ scaleX: veil }}
        />

        {/* Marcas, cursor e ponto moram em HTML sobre o SVG: dentro dele o
            `preserveAspectRatio="none"` viraria a bolinha numa elipse. */}
        <Marker at={RAID} tone="brass" pos={pos} reduce={reduce} />
        <Marker at={DROP} tone="warn" pos={pos} reduce={reduce} />

        <motion.span
          className="pointer-events-none absolute inset-y-0 w-px bg-cream/70"
          style={{ left }}
          aria-hidden="true"
        >
          <i className="absolute -top-1 -left-[3.5px] size-[7px] rounded-full bg-cream" />
        </motion.span>
        <motion.span
          className="pointer-events-none absolute z-2 -mt-[6px] -ml-[6px] size-3 rounded-full border-2 border-surface bg-cream"
          style={{ left, top: dotTop }}
          aria-hidden="true"
        />
      </div>

      {/* A leitura do cursor. Fica numa linha própria e não flutuando sobre a
          curva: pastilha que persegue o ponteiro tapa justamente o pedaço do
          gráfico que a pessoa está tentando ver.

          O texto é o próprio `MotionValue` renderizado como filho — o framer
          escreve o conteúdo direto no nó, sem passar pelo React. */}
      <div className="flex items-center justify-between gap-2 text-[0.6rem] font-bold tabular-nums text-faint-raised">
        <span>{clockAt(0)}</span>
        <motion.strong className="rounded-sm bg-surface-2 px-2 py-1 text-[0.66rem] font-extrabold text-cream">
          {readout}
        </motion.strong>
        <span>{clockAt(1)}</span>
      </div>

      <div className="mt-[13px] flex flex-wrap gap-[7px] [&>span]:text-[0.62rem]">
        <Chip tone="ok">{copy.peak}</Chip>
        <Chip quiet>{copy.average}</Chip>
        <Chip quiet>{copy.messages}</Chip>
        {/* As duas pastilhas de evento acendem quando o cursor chega nelas: é a
            legenda dizendo "é ISTO que você está olhando agora". */}
        <motion.span
          animate={{ scale: mark.raid ? 1.07 : 1 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          className="origin-left"
        >
          <Chip className={cn(!mark.raid && "opacity-55")}>{copy.raid}</Chip>
        </motion.span>
        <motion.span
          animate={{ scale: mark.drop ? 1.07 : 1 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          className="origin-left"
        >
          <Chip tone="warn" className={cn(!mark.drop && "opacity-55")}>
            {copy.drop}
          </Chip>
        </motion.span>
      </div>

      <p className="mt-2.5 text-[0.62rem] font-bold tracking-[0.04em] text-faint-raised">
        {copy.hint}
      </p>
    </div>
  );
}

/** Marcador de evento na curva: cresce quando o cursor chega perto.
 *
 *  A mola pendura no `MotionValue` do cursor, então o "acender" também acontece
 *  fora do render — este componente não re-renderiza nenhuma vez por causa
 *  disso. */
function Marker({
  at,
  tone,
  pos,
  reduce,
}: {
  at: number;
  tone: "brass" | "warn";
  pos: MotionValue<number>;
  reduce: boolean;
}) {
  // O `: number` não é enfeite: sem ele o TS infere a união `1 | 1.55` e a mola
  // não aceita um `MotionValue` de literais.
  const target = useTransform(pos, (p): number =>
    Math.abs(p - at) < NEAR ? 1.55 : 1,
  );
  const scale = useSpring(target, { stiffness: 320, damping: 26 });
  return (
    <motion.span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-2 -mt-[5px] -ml-[5px] size-2.5 rounded-full border-2 border-surface",
        tone === "warn" ? "bg-warn" : "bg-brass",
      )}
      style={{
        left: `${at * 100}%`,
        top: `${(yOf(viewersAt(at)) / H) * 100}%`,
        scale: reduce ? target : scale,
      }}
    />
  );
}
