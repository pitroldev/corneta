"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { useCalm, useHeartbeat } from "./use-motion";
import { PlatformGlyph } from "./decor";
import { InfoIcon } from "./icons";
import { cn } from "./ui";

// ============================================================
// O relatório TOCANDO: o vídeo da live e o gráfico no mesmo relógio.
//
// Esta peça existe porque é a única coisa que a Corneta faz e ninguém mais faz —
// e era justamente a metade invisível da página. Todo o resto da LP conta a live
// até o "BORA"; aqui a live já acabou e o streamer está procurando o que travou.
//
// ------------------------------------------------------------
// POR QUE FOI REESCRITA
// ------------------------------------------------------------
// A versão anterior TROCAVA de momento a cada 5,6 s: três slides girando. Isso
// não é um replay, é um carrossel — e o gesto que a seção vende (arrastar o
// tempo e ver tudo andar junto) não existia em lugar nenhum.
//
// Agora o cursor CAMINHA. O relógio anda, o quadro muda de estado no minuto
// certo, o chat volta a rolar na hora em que foi digitado e os dois gráficos
// têm um ponto correndo em cima da curva. É um player: tem play, tem pausa e
// tem barra pra arrastar.
//
// O passeio não percorre as 3h12 inteiras num fôlego — ele TOCA as três janelas
// que interessam e passa rápido pelo meio, que é o que qualquer resumo de
// gravação faz. Cada janela contém a virada dela: você vê a Twitch cair, e vê o
// OBS zerar enquanto as plataformas continuam recebendo.
//
// ------------------------------------------------------------
// O QUE SUMIU DE PROPÓSITO
// ------------------------------------------------------------
// As curvas se desenhavam com `pathLength` do framer. Isso é `stroke-dasharray`
// medido em unidades do usuário, dentro de um `viewBox` que estica X e Y por
// fatores diferentes e com `vector-effect: non-scaling-stroke` mandando o traço
// ser calculado em pixels de tela. As três coisas juntas desenhavam o tracejado
// numa escala e o traço noutra: a linha aparecia cortada. Onde o desenho
// estica, o movimento é posição/opacidade/recorte — nunca tracejado.
//
// A copy chega RESOLVIDA, não como `t`: função não atravessa a fronteira
// servidor→cliente do Next.
// ============================================================

/** Duração da sessão de exemplo, em minutos: 3h12. */
const SPAN_MIN = 192;
/** Posição de um minuto no eixo, em % da largura. Marcas, cursor e pontos moram
 *  em HTML (não dentro do SVG), então a unidade comum tem que ser relativa. */
const pctAt = (min: number) => (min / SPAN_MIN) * 100;

/** Cada faixa é um SVG de 600×56 no seu próprio quadro. */
const W = 600;
const LANE_H = 56;

export type MomentId = "chat" | "queda" | "brb";
type PlatId = "twitch" | "youtube" | "kick";

interface Moment {
  id: MomentId;
  /** Minuto de referência — é o que a marca do eixo aponta. */
  min: number;
  /** A janela que o passeio TOCA. Contém a virada: a queda começa dentro dela,
   *  e o OBS zera dentro dela. Ver a virada acontecer é o argumento; chegar
   *  depois de pronta é só uma foto. */
  from: number;
  to: number;
  tone: "brass" | "warn" | "ok";
  who: { name: string; platform: PlatId }[];
}

const MOMENTS: Moment[] = [
  {
    id: "chat",
    min: 42,
    from: 38,
    to: 48,
    tone: "brass",
    who: [
      { name: "biankaz", platform: "twitch" },
      { name: "duduzin", platform: "kick" },
      { name: "marIA_", platform: "youtube" },
      { name: "gugaFPS", platform: "twitch" },
      { name: "nanda_ok", platform: "twitch" },
      { name: "zeh", platform: "kick" },
      { name: "pastelzin", platform: "youtube" },
    ],
  },
  {
    id: "queda",
    min: 121,
    from: 116,
    to: 130,
    tone: "warn",
    who: [
      { name: "pedrones", platform: "twitch" },
      { name: "lulu.exe", platform: "twitch" },
      { name: "tonhao", platform: "youtube" },
      { name: "biankaz", platform: "twitch" },
      { name: "duduzin", platform: "kick" },
    ],
  },
  {
    id: "brb",
    min: 160,
    from: 154,
    to: 172,
    tone: "ok",
    who: [
      { name: "vitinho", platform: "kick" },
      { name: "carol_hd", platform: "youtube" },
      { name: "gugaFPS", platform: "twitch" },
      { name: "lulu.exe", platform: "twitch" },
      { name: "marIA_", platform: "youtube" },
    ],
  },
];

/** As duas viradas da live, nos minutos em que as CURVAS as desenham — os
 *  números saem do próprio traço abaixo, não de uma segunda verdade. */
const RECONNECT: [number, number] = [118, 129];
const OBS_OUT: [number, number] = [157, 174];

type FrameState = "live" | "reconnect" | "slate";
const frameAt = (min: number): FrameState =>
  min >= OBS_OUT[0] && min < OBS_OUT[1]
    ? "slate"
    : min >= RECONNECT[0] && min < RECONNECT[1]
      ? "reconnect"
      : "live";

// DUAS FAIXAS, não duas linhas no mesmo quadro.
//
// Na primeira versão as duas séries dividiam um gráfico só — e como elas passam
// quase no mesmo valor, a do OBS ficava escondida atrás da outra. Isso matava
// justamente a leitura que a seção existe pra provar: lá pelo minuto 157 o OBS
// zera e as plataformas NÃO.

/** O que as PLATAFORMAS receberam. Só afunda no engasgo da Twitch. */
const PLATFORMS: [number, number][] = [
  [0, 20], [60, 18], [131, 15], [200, 19], [300, 17], [350, 20], [369, 44],
  [386, 45], [404, 20], [470, 18], [484, 19], [520, 17], [600, 19],
];
/** O que o OBS mandou. Zera quando o OBS fecha e volta quando ele abre. */
const OBS: [number, number][] = [
  [0, 21], [60, 19], [131, 16], [200, 20], [300, 18], [350, 20], [369, 21],
  [404, 22], [470, 19], [484, 20], [490, 50], [540, 50], [548, 26], [600, 21],
];

const path = (pts: [number, number][]) =>
  pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");

/** Altura da curva num minuto qualquer — é o que põe o ponto EM CIMA do traço
 *  em vez de perto dele. */
function yAt(pts: [number, number][], min: number) {
  const x = Math.max(0, Math.min(W, (min / SPAN_MIN) * W));
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
  }
  return pts[pts.length - 1][1];
}

/** Quando cada fala foi digitada, em minutos de live.
 *
 *  As falas não se espalham pela janela inteira: elas começam depois do
 *  primeiro terço, porque chat REAGE. Numa janela que contém a virada, isso põe
 *  o "travou aí?" depois da queda, e não antes dela. */
const EVENTS = MOMENTS.flatMap((m) =>
  m.who.map((w, k) => ({
    moment: m.id,
    k,
    name: w.name,
    platform: w.platform,
    at: m.from + (m.to - m.from) * (0.32 + (0.62 * (k + 0.5)) / m.who.length),
  })),
);

/** Relógio de parede: a live começou 21:00. Mesma hora que o outro painel usa. */
const wallClock = (min: number) => {
  const t = Math.round(21 * 60 + min) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
/** Relógio da GRAVAÇÃO: quanto de vídeo já correu. */
const elapsed = (min: number) =>
  `${Math.floor(min / 60)}:${String(Math.floor(min % 60)).padStart(2, "0")}`;

export interface MomentCopy {
  tab: string;
  title: string;
  finding: string;
  reading: string;
  lines: string[];
}

export interface ReplayCopy {
  axis: string;
  seriesPlatforms: string;
  seriesObs: string;
  chartAria: string;
  chat: string;
  frameLive: string;
  frameReconnect: string;
  frameNote: string;
  preview: string;
  slateBrand: string;
  slateTitle: string;
  play: string;
  pause: string;
  scrub: string;
  hint: string;
  moments: Record<MomentId, MomentCopy>;
}

/** Quanto tempo cada janela leva pra tocar, e quanto leva o pulo até a próxima.
 *  A janela é longa de propósito: o veredito embaixo tem duas linhas pra ler. */
const PLAY_MS = 6200;
const SEEK_MS = 1100;
const TICK_MS = 100;

const easeInOut = (k: number) =>
  k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;

interface Tour {
  /** Índice do momento que está tocando (ou pro qual o cursor está indo). */
  i: number;
  kind: "play" | "seek";
  /** Milissegundos dentro da fase atual. */
  el: number;
  /** De onde o pulo saiu — só usado na fase "seek". */
  from: number;
  /** Minuto em que o cursor está. É a única fonte da verdade da peça inteira:
   *  quadro, chat, veredito e pontos das curvas saem todos daqui. */
  pos: number;
}

const nearest = (min: number) => {
  let best = 0;
  for (let i = 1; i < MOMENTS.length; i++) {
    if (Math.abs(MOMENTS[i].min - min) < Math.abs(MOMENTS[best].min - min)) best = i;
  }
  return best;
};

export function ReplayScope({ copy }: { copy: ReplayCopy }) {
  const calm = useCalm();
  const box = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);
  const [hover, setHover] = useState(false);
  const [tour, setTour] = useState<Tour>(() => ({
    i: 0,
    kind: "play",
    el: PLAY_MS * 0.42,
    from: MOMENTS[0].from,
    pos: MOMENTS[0].from + (MOMENTS[0].to - MOMENTS[0].from) * 0.42,
  }));

  // O passeio para quando: pediram menos movimento, apertaram pausa, o mouse
  // está em cima (ninguém lê um veredito que troca sozinho), ou a peça saiu da
  // tela / a aba foi pro fundo — isso último é o próprio `useHeartbeat`.
  useHeartbeat(box, TICK_MS, playing && !calm, () =>
    setTour((p) => {
      const el = p.el + TICK_MS;
      const m = MOMENTS[p.i];
      if (p.kind === "seek") {
        if (el >= SEEK_MS) return { ...p, kind: "play", el: 0, pos: m.from };
        const k = easeInOut(el / SEEK_MS);
        return { ...p, el, pos: p.from + (m.from - p.from) * k };
      }
      if (el >= PLAY_MS) {
        const i = (p.i + 1) % MOMENTS.length;
        return { i, kind: "seek", el: 0, from: p.pos, pos: p.pos };
      }
      return { ...p, el, pos: m.from + (m.to - m.from) * (el / PLAY_MS) };
    }),
    hover,
  );

  const pos = tour.pos;
  const active = MOMENTS[nearest(pos)];
  const state = frameAt(pos);

  /** Toda busca manual passa por aqui — e toda busca manual segura o passeio.
   *  Quem pegou a linha do tempo na mão não pode ver ela fugir do dedo. */
  const seek = (clientX: number) => {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const min = Math.max(0, Math.min(SPAN_MIN, ((clientX - r.left) / r.width) * SPAN_MIN));
    setPlaying(false);
    setTour((p) => ({ ...p, kind: "play", el: 0, from: min, pos: min }));
  };

  /** Play: retoma de onde o cursor parou. Se ele estiver no meio do nada, pula
   *  pra janela mais próxima em vez de tocar 40 minutos de linha reta. */
  const toggle = () => {
    if (playing) return setPlaying(false);
    const i = nearest(pos);
    const m = MOMENTS[i];
    setTour(
      pos < m.from || pos > m.to
        ? { i, kind: "seek", el: 0, from: pos, pos }
        : { i, kind: "play", el: ((pos - m.from) / (m.to - m.from)) * PLAY_MS, from: pos, pos },
    );
    setPlaying(true);
  };

  /** Botão de momento = botão de capítulo: pula pra lá e CONTINUA tocando. */
  const chapter = (i: number) => {
    setTour((p) => ({ i, kind: "seek", el: 0, from: p.pos, pos: p.pos }));
    setPlaying(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step =
      e.key === "ArrowRight" ? 2 : e.key === "ArrowLeft" ? -2 : e.key === "Home" ? -SPAN_MIN : e.key === "End" ? SPAN_MIN : 0;
    if (!step) return;
    e.preventDefault();
    setPlaying(false);
    setTour((p) => {
      const min = Math.max(0, Math.min(SPAN_MIN, p.pos + step));
      return { ...p, kind: "play", el: 0, from: min, pos: min };
    });
  };

  // Com movimento reduzido o tempo não anda, então prender o chat ao relógio
  // esconderia quase todas as falas. Aí ele mostra o momento inteiro.
  const lines = (calm ? EVENTS.filter((e) => e.moment === active.id) : EVENTS.filter((e) => e.at <= pos))
    .slice(-5);

  return (
    <div
      ref={box}
      // Passar o mouse ou dar foco PAUSA (não mata): quem está lendo o veredito
      // não pode ver o texto trocar embaixo do olho. Sair retoma.
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setHover(true)}
      onBlurCapture={() => setHover(false)}
      className="rounded-xl bg-panel p-[clamp(14px,2vw,20px)] shadow-pop-lg"
    >
      {/* --- quadro + chat --- */}
      <div className="grid gap-3 [grid-template-columns:minmax(0,1.34fr)_minmax(0,1fr)] max-[820px]:grid-cols-1">
        <Frame state={state} pos={pos} copy={copy} calm={calm} />
        <ChatColumn lines={lines} copy={copy} calm={calm} />
      </div>

      {/* --- a linha do tempo: o eixo que as duas metades compartilham --- */}
      <div className="mt-3 rounded-lg bg-surface p-[13px]">
        <div className="mb-2 flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? copy.pause : copy.play}
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-sm bg-brass text-brass-ink shadow-pop-brass outline-offset-2 transition-colors duration-150 hover:bg-brass-strong focus-visible:outline-[3px] focus-visible:outline-brass [@media(pointer:coarse)]:size-11"
          >
            {playing ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4 translate-x-px" aria-hidden="true">
                <path d="M8 5l11 7-11 7z" fill="currentColor" />
              </svg>
            )}
          </button>
          <span className="text-[0.62rem] font-extrabold tracking-[0.12em] text-faint-raised uppercase">
            {copy.axis}
          </span>
          <span className="ml-auto font-display text-[0.8rem] font-extrabold text-cream tabular-nums">
            {elapsed(pos)}
          </span>
        </div>

        {/* O desenho é decorativo pro leitor de tela: a leitura vem do texto do
            veredito e dos rótulos dos momentos, que são botões de verdade. */}
        <p className="sr-only">{copy.chartAria}</p>
        <div
          ref={track}
          role="slider"
          tabIndex={0}
          aria-label={copy.scrub}
          aria-valuemin={0}
          aria-valuemax={SPAN_MIN}
          aria-valuenow={Math.round(pos)}
          aria-valuetext={`${elapsed(pos)} — ${copy.moments[active.id].tab}`}
          onKeyDown={onKeyDown}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            seek(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(e.clientX);
          }}
          onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
          className="relative cursor-ew-resize touch-pan-y rounded-sm outline-offset-4 focus-visible:outline-[3px] focus-visible:outline-brass"
        >
          {/* A janela em que o OBS esteve fora. Atravessa as DUAS faixas: é ela
              que emoldura o contraste (uma zera, a outra não). */}
          <span
            className="pointer-events-none absolute inset-y-0 bg-ok/10"
            style={{
              left: `${pctAt(OBS_OUT[0])}%`,
              width: `${pctAt(OBS_OUT[1]) - pctAt(OBS_OUT[0])}%`,
            }}
          />
          {/* O trecho já tocado, como em qualquer player. */}
          <span
            className="pointer-events-none absolute inset-y-0 left-0 bg-cream/5"
            style={{ width: `${pctAt(pos)}%` }}
          />

          <Lane
            pts={PLATFORMS}
            tone="brass"
            label={copy.seriesPlatforms}
            floor={false}
            pos={pos}
            calm={calm}
          />
          <Lane
            pts={OBS}
            tone="muted"
            label={copy.seriesObs}
            floor
            pos={pos}
            calm={calm}
          />

          {/* Marcas dos momentos que não estão selecionados. A ativa some: quem
              ocupa aquele lugar passa a ser o cursor. */}
          {MOMENTS.map((m) => (
            <span
              key={m.id}
              className={cn(
                "pointer-events-none absolute inset-y-0 w-0.5 transition-opacity duration-200",
                m.tone === "warn" ? "bg-warn" : m.tone === "ok" ? "bg-ok" : "bg-brass",
                m.id === active.id ? "opacity-0" : "opacity-45",
              )}
              style={{ left: `${pctAt(m.min)}%` }}
            />
          ))}

          {/* O cursor: linha cheia + ponto no topo, igual ao do app. Sem mola:
              ele não persegue um alvo, ele É o tempo — a suavidade vem do
              passo de 100 ms, não de uma física por cima. */}
          <span
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-cream"
            style={{ left: `${pctAt(pos)}%` }}
          >
            <i className="absolute -top-0.5 -left-[3px] size-2 rounded-full bg-cream" />
          </span>
        </div>

        {/* Os momentos são botões de verdade — teclado, foco, aria-pressed — e
            ficam ANCORADOS na posição do instante, não espalhados em fileira: o
            rótulo é a legenda daquela marca, e longe dela vira lista solta. */}
        <div className="relative mt-2 h-8 max-[620px]:flex max-[620px]:h-auto max-[620px]:flex-wrap max-[620px]:gap-1.5">
          {MOMENTS.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => chapter(i)}
              aria-pressed={m.id === active.id}
              style={{ left: `${pctAt(m.min)}%` }}
              className={cn(
                "absolute top-0 max-[620px]:static max-[620px]:translate-x-0",
                // Nas pontas o rótulo encosta na borda; por isso o primeiro
                // alinha pela esquerda, o último pela direita, o do meio centra.
                i === 0
                  ? "translate-x-0"
                  : i === MOMENTS.length - 1
                    ? "-translate-x-full"
                    : "-translate-x-1/2",
                // Alvo de toque: 21px de altura reprova em qualquer régua. Em
                // ponteiro grosso a caixa cresce; no mouse fica compacta, que é
                // o que mantém o rótulo colado na marca do eixo.
                "cursor-pointer rounded-sm px-2 py-1 text-[0.64rem] leading-[1.25] font-extrabold tracking-[0.02em] whitespace-nowrap uppercase",
                "[@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:px-3 [@media(pointer:coarse)]:py-2.5",
                "outline-offset-2 transition-colors duration-150 focus-visible:outline-[3px] focus-visible:outline-brass",
                m.id === active.id
                  ? "bg-brass text-brass-ink shadow-pop-brass"
                  : "text-faint-raised hover:text-cream",
              )}
            >
              {copy.moments[m.id].tab}
              <span className="sr-only"> — {copy.moments[m.id].title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* --- o veredito: a frase que o relatório escreve sozinho --- */}
      <p className="mt-3 flex items-start gap-2.5 rounded-lg bg-surface-2 px-3.5 py-3 text-[0.84rem] leading-[1.5] font-[550] text-muted [&>svg]:mt-px [&>svg]:h-[17px] [&>svg]:w-[17px] [&>svg]:shrink-0 [&>svg]:fill-current [&>svg]:text-brass">
        <InfoIcon />
        {/* Troca com transição, não piscando: o veredito é a frase que o
            relatório escreve, e ela aparecendo suave lê como conclusão sendo
            calculada. Corte seco leria como bug. */}
        <motion.span
          key={active.id}
          initial={calm ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        >
          <b className="font-extrabold text-cream">
            {copy.moments[active.id].finding}
          </b>{" "}
          {copy.moments[active.id].reading}
        </motion.span>
      </p>

      <p className="mt-2.5 text-[0.62rem] font-bold tracking-[0.04em] text-faint-raised">
        {copy.hint}
      </p>
    </div>
  );
}

/**
 * Uma faixa do gráfico: rótulo à esquerda, curva à direita, ponto correndo em
 * cima dela.
 *
 * `floor` desenha o fio do zero — sem ele, a linha do OBS deitada no fundo
 * pareceria "sem dado" em vez de "zerado", que é o contrário do que ela diz.
 */
function Lane({
  pts,
  tone,
  label,
  floor,
  pos,
  calm,
}: {
  pts: [number, number][];
  tone: "brass" | "muted";
  label: string;
  floor: boolean;
  pos: number;
  calm: boolean;
}) {
  const y = yAt(pts, pos);
  return (
    <div className="relative">
      {/* O rótulo ganha o fundo da faixa atrás: sem isso a curva passa por baixo
          das letras logo no começo do eixo e as duas viram um borrão. */}
      <span className="pointer-events-none absolute top-0.5 left-0 z-2 bg-surface pr-2 text-[0.58rem] font-extrabold tracking-[0.08em] text-faint-raised uppercase">
        {label}
      </span>
      <svg
        viewBox={`0 0 ${W} ${LANE_H}`}
        preserveAspectRatio="none"
        className="block h-14 w-full"
        aria-hidden="true"
      >
        <line
          x1={0}
          y1={LANE_H - 6}
          x2={W}
          y2={LANE_H - 6}
          stroke="var(--color-border-dry)"
          strokeWidth={1}
          strokeDasharray={floor ? undefined : "3 4"}
        />
        <path
          d={path(pts)}
          fill="none"
          stroke={tone === "brass" ? "var(--brass)" : "var(--color-muted)"}
          strokeWidth={tone === "brass" ? 3 : 2}
          strokeLinejoin="round"
          strokeLinecap="round"
          // `preserveAspectRatio: none` estica o traço junto com o quadro; sem
          // isto a linha engorda na horizontal e some na vertical.
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* O ponto que corre EM CIMA da curva. É ele que fecha o argumento da
          seção: no minuto do JÁ VOLTO um mergulha até o chão e o outro segue
          reto — lado a lado, no mesmo instante. */}
      <motion.i
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute z-2 -mt-[5px] -ml-[5px] block size-2.5 rounded-full border-2 border-surface",
          tone === "brass" ? "bg-brass" : "bg-muted",
        )}
        style={{ left: `${pctAt(pos)}%`, top: `${(y / LANE_H) * 100}%` }}
        animate={{ scale: y > LANE_H - 12 ? 1.35 : 1 }}
        transition={{ duration: calm ? 0 : 0.25 }}
      />
    </div>
  );
}

/**
 * O quadro do replay.
 *
 * Não há foto: a moldura é a mesma abstração de meio-tom que o editor de recorte
 * usa, com o ESTADO do instante escrito nela. No momento do JÁ VOLTO ela vira a
 * arte que o app coloca no ar de verdade — a única "cena" honesta que existe.
 */
function Frame({
  state,
  pos,
  copy,
  calm,
}: {
  state: FrameState;
  pos: number;
  copy: ReplayCopy;
  calm: boolean;
}) {
  const dests: { platform: PlatId; live: boolean }[] = [
    { platform: "twitch", live: state !== "reconnect" },
    { platform: "youtube", live: true },
    { platform: "kick", live: true },
  ];

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg border-2 border-border-dry bg-surface bg-[image:var(--halftone-dark)] bg-[length:16px_16px]">
      {/* A `key` é o ESTADO, não o momento: o quadro remonta exatamente quando o
          que está no ar muda — e é aí que a troca tem significado. */}
      <motion.div
        key={state}
        initial={calm ? false : { opacity: 0, scale: 1.015 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="grid h-full place-content-center justify-items-center px-4 pb-9 text-center"
      >
        {state === "slate" ? (
          // A arte real da tela JÁ VOLTO, a mesma da seção de proteção.
          <div className="grid place-items-center">
            <small className="font-display text-[0.6rem] font-bold tracking-[0.14em] text-brass">
              {copy.slateBrand}
            </small>
            <strong className="mt-2 rotate-[-1.7deg] bg-brass px-[0.16em] pt-[0.02em] pb-[0.08em] font-display text-[clamp(1.3rem,3.4vw,2rem)] leading-none font-extrabold text-brass-ink shadow-[5px_5px_0_0_var(--night)]">
              {copy.slateTitle}
            </strong>
          </div>
        ) : state === "reconnect" ? (
          <>
            {/* O arco girando é o mesmo sinal que o app dá enquanto tenta: é uma
                tentativa em curso, não um erro parado. */}
            <motion.svg
              viewBox="0 0 24 24"
              className="size-11 text-warn"
              aria-hidden="true"
              animate={calm ? undefined : { rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.25"
                strokeWidth="2.6"
              />
              <path
                d="M12 3a9 9 0 0 1 9 9"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            </motion.svg>
            <strong className="mt-3 font-display text-[clamp(1.1rem,2.4vw,1.5rem)] leading-none font-extrabold text-warn">
              {copy.frameReconnect}
            </strong>
          </>
        ) : (
          <>
            <strong className="font-display text-[clamp(1.4rem,3vw,2.1rem)] leading-none font-extrabold text-cream tabular-nums">
              {wallClock(pos)}
            </strong>
            <span className="mt-2 text-[0.72rem] font-[550] text-faint-raised">
              {copy.frameNote}
            </span>
          </>
        )}
      </motion.div>

      {/* Só o selo aqui. O relógio da gravação mora na barra de transporte, logo
          abaixo: três relógios na mesma peça (o de parede no meio do quadro, um
          no canto e outro no transporte) é ruído, não informação. */}
      <span className="absolute top-2 right-2.5 text-[0.54rem] font-extrabold tracking-[0.1em] text-faint-raised uppercase">
        {copy.preview}
      </span>

      {/* A barra de destinos daquele segundo — a leitura que fecha o argumento:
          no quadro do JÁ VOLTO os três continuam NO AR. */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 border-t border-border-dry bg-night/85 px-2.5 py-2">
        {dests.map((d) => (
          <span
            key={d.platform}
            className="flex items-center gap-1.5 text-[0.58rem] font-extrabold tracking-[0.06em] uppercase [&_.glyph]:h-[15px] [&_.glyph]:w-[15px]"
          >
            <PlatformGlyph id={d.platform} />
            <i
              aria-hidden="true"
              className={cn(
                "h-[6px] w-[6px] rounded-full",
                d.live ? "bg-ok" : "bg-warn",
                !d.live && !calm && "animate-[soft-pulse_1.2s_ease-in-out_infinite]",
              )}
            />
            <span className={d.live ? "text-ok" : "text-warn"}>
              {d.live ? copy.frameLive : copy.frameReconnect}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** As falas daquele trecho. É o chat gravado voltando a rolar — cada uma entra
 *  no minuto em que foi digitada, não todas de uma vez na troca de momento. */
function ChatColumn({
  lines,
  copy,
  calm,
}: {
  lines: typeof EVENTS;
  copy: ReplayCopy;
  calm: boolean;
}) {
  return (
    <div className="flex flex-col rounded-lg bg-surface p-[13px]">
      <span className="mb-2.5 text-[0.62rem] font-extrabold tracking-[0.12em] text-faint-raised uppercase">
        {copy.chat}
      </span>
      {/* Ancorado embaixo, como todo chat: a fala nova entra no pé e as antigas
          sobem. Altura livre — a coluna acompanha o quadro ao lado. */}
      <div className="flex flex-1 flex-col justify-end gap-[7px] overflow-hidden">
        {lines.map((line) => (
          <motion.p
            key={`${line.moment}-${line.k}`}
            initial={calm ? false : { opacity: 0, y: 9 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-[18px_minmax(0,1fr)] items-start gap-2 text-[0.76rem] leading-[1.35] [&_.glyph]:h-[18px] [&_.glyph]:w-[18px]"
          >
            <PlatformGlyph id={line.platform} />
            <span>
              <b className="font-extrabold text-cream">{line.name}</b>
              <span className="ml-1 text-[0.58rem] font-bold text-faint-raised tabular-nums">
                {wallClock(line.at)}
              </span>
              <br />
              <span className="font-[550] text-muted">
                {copy.moments[line.moment].lines[line.k]}
              </span>
            </span>
          </motion.p>
        ))}
      </div>
    </div>
  );
}
