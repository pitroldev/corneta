"use client";

import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PlatformGlyph } from "./decor";
import { EyeIcon } from "./icons";
import { Chip, cn, DemoLabel, State } from "./ui";
import { useCalm, useHeartbeat } from "./use-motion";
import { fill } from "@/lib/i18n";

// Sala de guerra: o que o painel Ao vivo mostra por destino enquanto você
// transmite — bitrate, fps, quadros perdidos e tempo no ar, mais CPU/GPU reais.
// Estados e nomes de métrica saem de TargetStatus/EngineSnapshot (src/lib/types.ts).
//
// ------------------------------------------------------------
// MOVIMENTO: cada painel faz o VERBO do seu momento
// ------------------------------------------------------------
// A jornada tem três passos — antes, durante, depois — e cada painel se move
// como aquele instante se move. O de "durante" está no meio de uma reconexão,
// então o contador de segundos fora ANDA: parado, ele era um screenshot de um
// problema; andando, é um problema acontecendo. O de "depois" desenha a curva,
// porque é isso que um relatório faz quando abre.
//
// Nenhum dos dois inventa um efeito novo: os dois usam o mesmo vocabulário do
// herói e do replay (batimento que para fora da tela, traço que se desenha).
//
// ------------------------------------------------------------
// A COPY ESTAVA CRAVADA EM PORTUGUÊS
// ------------------------------------------------------------
// Até esta revisão, as duas peças escreviam "reconectando · tentativa 2 · 12 s
// fora", "pausado por você" e "1 284 assistindo" direto no JSX — então a página
// em inglês mostrava português no meio da seção que vende a jornada inteira. O
// teste de paridade dos dicionários não pegava porque as frases nunca chegaram
// a entrar em dicionário nenhum. Agora chegam resolvidas, como nas outras peças
// animadas: função `t` não atravessa a fronteira servidor→cliente.

/** `text-cream` explícito: estes painéis aparecem sobre seções de PAPEL, onde a
 *  tinta herdada é escura — sem isso o nome da plataforma some no fundo escuro. */
const PANEL = "rounded-lg bg-surface p-[18px] text-cream shadow-pop-ink-lg";

const ROW =
  "grid grid-cols-[30px_minmax(0,1fr)_auto] max-[760px]:grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md bg-surface-2 px-2.5 py-[9px] not-first:mt-[7px] " +
  "[&_.glyph]:h-[30px] [&_.glyph]:w-[30px] " +
  "[&>div>strong]:block [&>div>strong]:font-display [&>div>strong]:text-[0.84rem] [&>div>strong]:font-bold " +
  "[&>div>small]:mt-0.5 [&>div>small]:block [&>div>small]:text-[0.62rem] [&>div>small]:font-[550] [&>div>small]:tabular-nums [&>div>small]:text-faint-raised";

export interface LiveRoomCopy {
  label: string;
  tag: string;
  /** Já resolvida por linha: FUNÇÃO não atravessa a fronteira servidor→cliente
   *  do Next. Foi exatamente o tropeço que a primeira versão desta refatoração
   *  cometeu, e o build reclamou na hora. */
  metricsTwitch: string;
  metricsYoutube: string;
  onAir: string;
  /** Template com o buraco do contador ainda por preencher: só o número é do
   *  cliente, e o texto em volta continua saindo do dicionário. */
  reconnectingTemplate: string;
  back: string;
  paused: string;
  pausedState: string;
  cpu: string;
  gpu: string;
  /** "{n} assistindo" */
  watching: string;
}

export interface ReportChartCopy {
  label: string;
  tag: string;
  chartAria: string;
  peak: string;
  average: string;
  messages: string;
  raid: string;
  drop: string;
}

/** Medidor de carga: rótulo, barrinha e número. */
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
        {/* A barra sobe do zero quando o painel aparece: é uma medida sendo
            feita, não um valor que sempre esteve ali. */}
        <motion.b
          className={cn("block h-full origin-left", ok ? "bg-ok" : "bg-brass")}
          style={{ width: `${pct}%` }}
          initial={calm ? false : { scaleX: 0 }}
          whileInView={calm ? undefined : { scaleX: 1 }}
          viewport={{ once: true, amount: 0.8 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
      </i>
      {pct}%
    </span>
  );
}

export function LiveRoom({ copy }: { copy: LiveRoomCopy }) {
  // Dois "calmas" com papéis diferentes: o do LAÇO pode nascer parado (é o certo
  // — não anima antes de saber), o da ENTRADA não pode, senão ela não acontece.
  // DOIS "calmas", com papéis diferentes — e confundir os dois já custou uma
  // animação que nunca acontecia:
  //  • o do LAÇO (`useCalm`) pode nascer parado, e deve: o servidor não sabe a
  //    preferência, e começar animando pra depois parar é o pior dos mundos;
  //  • o da ENTRADA (`useReducedMotion`) não pode, porque o framer aplica
  //    `initial` só na montagem. Se ele nascer "calmo", o elemento monta já no
  //    estado final e a entrada nunca roda.
  const calm = useCalm();
  const calmOnMount = useReducedMotion() ?? false;
  const box = useRef<HTMLDivElement>(null);
  const [secs, setSecs] = useState(12);
  // O contador de "segundos fora" anda enquanto o painel está na tela. Volta pro
  // 12 depois de um tempo: a Kick reconecta, e deixar o número subir pra sempre
  // contaria uma história pior do que a verdadeira.
  useHeartbeat(box, 1000, !calm, () => setSecs((s) => (s >= 27 ? 12 : s + 1)));

  return (
    <div ref={box} className={PANEL}>
      <DemoLabel>
        <span>{copy.label}</span>
        <span>{copy.tag}</span>
      </DemoLabel>

      <div className={ROW}>
        <PlatformGlyph id="twitch" />
        <div>
          <strong>Twitch</strong>
          <small>{copy.metricsTwitch}</small>
        </div>
        <State>
          <i /> {copy.onAir}
        </State>
      </div>

      <div className={ROW}>
        <PlatformGlyph id="youtube" />
        <div>
          <strong>YouTube</strong>
          <small>{copy.metricsYoutube}</small>
        </div>
        <State>
          <i /> {copy.onAir}
        </State>
      </div>

      <div className={ROW}>
        <PlatformGlyph id="kick" />
        <div>
          <strong>Kick</strong>
          <small>{fill(copy.reconnectingTemplate, { s: String(secs) })}</small>
        </div>
        <State tone="warn">
          {/* O ponto pulsa só nesta linha: é a única que está tentando algo. */}
          <i
            className={cn(
              !calm && "animate-[soft-pulse_1.2s_ease-in-out_infinite]",
            )}
          />{" "}
          {copy.back}
        </State>
      </div>

      <div className={ROW}>
        <PlatformGlyph id="tiktok" />
        <div>
          <strong>TikTok</strong>
          <small>{copy.paused}</small>
        </div>
        <State tone="quiet">
          <i /> {copy.pausedState}
        </State>
      </div>

      <div className="mt-[13px] flex flex-wrap gap-x-4 gap-y-2 border-t-2 border-border-soft pt-[13px]">
        <Meter label={copy.cpu} pct={18} calm={calmOnMount} />
        <Meter label={copy.gpu} pct={31} ok calm={calmOnMount} />
        <span className="flex items-center gap-[7px] text-[0.66rem] font-extrabold tracking-[0.04em] whitespace-nowrap text-muted uppercase [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:shrink-0 [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round] [&>svg]:[stroke-width:2.2]">
          <EyeIcon />
          {copy.watching}
        </span>
      </div>
    </div>
  );
}

// Relatório pós-live: a curva de audiência com os marcadores do que aconteceu.
// A análise real (src/screens/ReportsScreen.tsx) usa viewerSamples, alertEvents,
// taxa de chat e janelas com problema; aqui é uma sessão de exemplo.
const CURVE =
  "M0,74 L18,70 L36,66 L54,58 L72,55 L90,49 L108,52 L126,44 L144,40 L162,34 L180,22 L198,18 L216,20 L234,26 L252,24 L270,30 L288,36 L306,33 L324,42 L342,48 L360,60";

// `vector-effect` mantém a espessura do traço quando o SVG estica sem proporção.
const GRID =
  "stroke-border-dry [stroke-width:1] [vector-effect:non-scaling-stroke]";
const LINE =
  "fill-none stroke-brass [stroke-width:2.5] [stroke-linecap:round] [stroke-linejoin:round] [vector-effect:non-scaling-stroke]";

export function ReportChart({ copy }: { copy: ReportChartCopy }) {
  // `useReducedMotion` do framer, não o `useCalm` daqui — ver a nota no
  // LiveRoom. A primeira versão usava o `useCalm` e a curva nascia pronta: a
  // entrada existia no código e nunca acontecia na tela.
  const calm = useReducedMotion() ?? false;
  const draw = calm
    ? {}
    : {
        initial: { pathLength: 0 },
        whileInView: { pathLength: 1 },
        viewport: { once: true, amount: 0.7 },
        transition: { duration: 1.1, ease: [0.16, 1, 0.3, 1] as const },
      };

  return (
    <div className={PANEL}>
      <DemoLabel>
        <span>{copy.label}</span>
        <span>{copy.tag}</span>
      </DemoLabel>

      <svg
        className="my-1.5 block h-auto w-full overflow-visible"
        viewBox="0 0 360 96"
        preserveAspectRatio="none"
        role="img"
        aria-label={copy.chartAria}
      >
        <line className={GRID} x1="0" y1="24" x2="360" y2="24" />
        <line className={GRID} x1="0" y1="56" x2="360" y2="56" />
        {/* A área preenche depois que a linha passa: primeiro o traço, depois o
            corpo — a ordem em que alguém desenharia à mão. */}
        <motion.path
          className="fill-brass/15"
          d={`${CURVE} L360,96 L0,96 Z`}
          initial={calm ? false : { opacity: 0 }}
          whileInView={calm ? undefined : { opacity: 1 }}
          viewport={{ once: true, amount: 0.7 }}
          transition={{ duration: 0.5, delay: 0.75 }}
        />
        <motion.path className={LINE} d={CURVE} {...draw} />
        {/* As bolinhas usam a cor da legenda correspondente: latão = raid,
            âmbar = trecho com queda. Entram quando o traço já passou por elas. */}
        <motion.circle
          className="fill-brass stroke-surface [stroke-width:2]"
          cx="180"
          cy="22"
          r="4.5"
          initial={calm ? false : { scale: 0 }}
          whileInView={calm ? undefined : { scale: 1 }}
          viewport={{ once: true, amount: 0.7 }}
          transition={{ duration: 0.3, delay: 0.62, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: "180px 22px" }}
        />
        <motion.circle
          className="fill-warn stroke-surface [stroke-width:2]"
          cx="252"
          cy="24"
          r="4.5"
          initial={calm ? false : { scale: 0 }}
          whileInView={calm ? undefined : { scale: 1 }}
          viewport={{ once: true, amount: 0.7 }}
          transition={{ duration: 0.3, delay: 0.82, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: "252px 24px" }}
        />
      </svg>

      <div className="flex justify-between text-[0.6rem] font-bold tabular-nums text-faint-raised">
        <span>21:00</span>
        <span>22:30</span>
        <span>00:12</span>
      </div>

      <div className="mt-[13px] flex flex-wrap gap-[7px] [&>span]:text-[0.62rem]">
        <Chip tone="ok">{copy.peak}</Chip>
        <Chip quiet>{copy.average}</Chip>
        <Chip quiet>{copy.messages}</Chip>
        <Chip>{copy.raid}</Chip>
        <Chip tone="warn">{copy.drop}</Chip>
      </div>
    </div>
  );
}
