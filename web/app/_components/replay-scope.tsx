"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PlatformGlyph } from "./decor";
import { InfoIcon } from "./icons";
import { cn } from "./ui";

// ============================================================
// A linha do tempo do relatório: o vídeo da live e o gráfico no MESMO relógio.
//
// Esta peça existe porque é a única coisa que a Corneta faz e ninguém mais faz —
// e era justamente a metade invisível da página. Todo o resto da LP conta a live
// até o "BORA"; aqui a live já acabou e o streamer está procurando o que travou.
//
// A demonstração é o próprio laço do produto: clicar num momento do gráfico leva
// o vídeo pra lá. Por isso os três momentos NÃO são decorativos — cada um mostra
// uma leitura diferente que só existe quando as duas metades compartilham o eixo:
//   1. o pico de chat vira sugestão de corte;
//   2. a queda de bitrate ganha causa provável (a CPU no mesmo minuto);
//   3. o OBS cai e as plataformas continuam recebendo — a prova do JÁ VOLTO,
//      que em qualquer outra ferramenta seria só uma promessa em texto.
//
// Nada aqui simula uma cena de streamer: o quadro é a moldura do app com meio-tom,
// do mesmo jeito que o editor de recorte faz. Inventar um rosto seria a mentira
// que o tom da marca não aceita.
//
// A copy chega RESOLVIDA, não como `t`: função não atravessa a fronteira
// servidor→cliente do Next. É o mesmo contrato do editor de recorte.
// ============================================================

/** Duração ilustrativa da sessão, em minutos — o eixo X inteiro. */
const SPAN_MIN = 192;
/** Posição de um minuto no eixo, em % da largura. As faixas e o cursor moram em
 *  HTML (não dentro do SVG), então a unidade comum tem que ser relativa. */
const pctAt = (min: number) => (min / SPAN_MIN) * 100;

/** Cada faixa é um SVG de 600×56 no seu próprio quadro. As marcas e o cursor não
 *  usam esta coordenada: eles moram em HTML, em % (ver `pctAt`). */
const W = 600;
const LANE_H = 56;

export type MomentId = "chat" | "queda" | "brb";

interface Moment {
  id: MomentId;
  /** Minuto da live. Vira posição no eixo e o relógio do player. */
  min: number;
  /** Estado do quadro naquele instante — muda a moldura, não uma foto falsa. */
  frame: "live" | "reconnect" | "slate";
  tone: "brass" | "warn" | "ok";
  /** Estado de cada destino NAQUELE instante — a barra sob o quadro.
   *
   *  É o dado que faz o quadro valer a área que ocupa: sem ela sobrava um
   *  retângulo vazio de 400px com uma pastilha no meio. E é aqui que a leitura
   *  do slate fecha: com o OBS fechado, os três continuam "no ar". */
  dests: { platform: "twitch" | "youtube" | "kick"; live: boolean }[];
  /** Quem falou naquele instante, na ordem em que aparecem. */
  who: { at: string; name: string; platform: "twitch" | "youtube" | "kick" }[];
}

const ALL_LIVE = [
  { platform: "twitch" as const, live: true },
  { platform: "youtube" as const, live: true },
  { platform: "kick" as const, live: true },
];

const MOMENTS: Moment[] = [
  {
    id: "chat",
    min: 42,
    frame: "live",
    tone: "brass",
    dests: ALL_LIVE,
    who: [
      { at: "42:04", name: "biankaz", platform: "twitch" },
      { at: "42:07", name: "duduzin", platform: "kick" },
      { at: "42:09", name: "marIA_", platform: "youtube" },
      { at: "42:11", name: "gugaFPS", platform: "twitch" },
      { at: "42:12", name: "nanda_ok", platform: "twitch" },
      { at: "42:14", name: "zeh", platform: "kick" },
      { at: "42:15", name: "pastelzin", platform: "youtube" },
    ],
  },
  {
    id: "queda",
    min: 118,
    frame: "reconnect",
    tone: "warn",
    // A Twitch caiu; as outras duas nem ficaram sabendo.
    dests: [
      { platform: "twitch", live: false },
      { platform: "youtube", live: true },
      { platform: "kick", live: true },
    ],
    who: [
      { at: "58:31", name: "pedrones", platform: "twitch" },
      { at: "58:35", name: "lulu.exe", platform: "twitch" },
      { at: "58:40", name: "tonhao", platform: "youtube" },
      { at: "58:44", name: "biankaz", platform: "twitch" },
      { at: "58:51", name: "duduzin", platform: "kick" },
    ],
  },
  {
    id: "brb",
    min: 155,
    frame: "slate",
    tone: "ok",
    // O OBS fechou e os TRÊS continuam no ar: é a linha inteira do argumento.
    dests: ALL_LIVE,
    who: [
      { at: "35:12", name: "vitinho", platform: "kick" },
      { at: "35:20", name: "carol_hd", platform: "youtube" },
      { at: "35:44", name: "gugaFPS", platform: "twitch" },
      { at: "35:58", name: "lulu.exe", platform: "twitch" },
      { at: "36:10", name: "marIA_", platform: "youtube" },
    ],
  },
];

// DUAS FAIXAS, não duas linhas no mesmo quadro.
//
// Na primeira versão as duas séries dividiam um gráfico só — e como elas passam
// quase no mesmo valor, a do OBS ficava escondida atrás da de latão. Isso matava
// justamente a leitura que a seção existe pra provar: no minuto 155 o OBS zera e
// as plataformas NÃO. Separadas em faixas, o buraco de uma contra a régua cheia
// da outra é a primeira coisa que o olho pega.

/** O que as PLATAFORMAS receberam. Só afunda no engasgo da Twitch (min 118). */
const LINE_PLATFORMS =
  "M0,20 L60,18 L131,15 L200,19 L300,17 L350,20 L369,44 L386,45 L404,20 L470,18 L484,19 L520,17 L600,19";
/** O que o OBS mandou. Zera no minuto 155 (o OBS fechou) e volta no 175. */
const LINE_OBS =
  "M0,21 L60,19 L131,16 L200,20 L300,18 L350,20 L369,21 L404,22 L470,19 L484,20 L490,50 L540,50 L548,26 L600,21";

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
  moments: Record<MomentId, MomentCopy>;
}

export function ReplayScope({ copy }: { copy: ReplayCopy }) {
  const [id, setId] = useState<MomentId>("queda");
  const reduce = useReducedMotion();
  const active = MOMENTS.find((m) => m.id === id)!;
  // Mola curta: o cursor tem que parecer que ENCOSTOU no ponto, não deslizar até ele.
  const spring = reduce
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 320, damping: 32 } as const);

  return (
    <div className="rounded-xl bg-panel p-[clamp(14px,2vw,20px)] shadow-pop-lg">
      {/* --- quadro + chat --- */}
      <div className="grid gap-3 [grid-template-columns:minmax(0,1.34fr)_minmax(0,1fr)] max-[820px]:grid-cols-1">
        <Frame moment={active} copy={copy} />
        <ChatColumn moment={active} copy={copy} />
      </div>

      {/* --- a linha do tempo: o eixo que as duas metades compartilham --- */}
      <div className="mt-3 rounded-lg bg-surface p-[13px]">
        {/* A legenda saiu: com as faixas rotuladas na própria curva, repetir os
            nomes aqui em cima seria dizer duas vezes o que já está escrito. */}
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <span className="text-[0.62rem] font-extrabold tracking-[0.12em] text-faint-raised uppercase">
            {copy.axis}
          </span>
        </div>

        {/* O desenho é decorativo pro leitor de tela: a leitura vem do texto do
            veredito e dos rótulos dos momentos, que são botões de verdade. O
            resumo do gráfico fica na descrição abaixo. */}
        <p className="sr-only">{copy.chartAria}</p>
        <div className="relative" aria-hidden="true">
          {/* A janela em que o OBS esteve fora. Atravessa as DUAS faixas: é ela
              que emoldura o contraste (uma zera, a outra não). */}
          <span
            className="absolute inset-y-0 bg-ok/10"
            style={{
              left: `${pctAt(155)}%`,
              width: `${pctAt(175) - pctAt(155)}%`,
            }}
          />

          <Lane
            d={LINE_PLATFORMS}
            tone="brass"
            label={copy.seriesPlatforms}
            floor={false}
          />
          <Lane d={LINE_OBS} tone="muted" label={copy.seriesObs} floor />

          {/* Marcas dos momentos que não estão selecionados. A ativa some: quem
              ocupa aquele lugar passa a ser o cursor. */}
          {MOMENTS.map((m) => (
            <span
              key={m.id}
              className={cn(
                "absolute inset-y-0 w-0.5 transition-opacity duration-200",
                m.tone === "warn"
                  ? "bg-warn"
                  : m.tone === "ok"
                    ? "bg-ok"
                    : "bg-brass",
                m.id === id ? "opacity-0" : "opacity-45",
              )}
              style={{ left: `${pctAt(m.min)}%` }}
            />
          ))}

          {/* O cursor: linha cheia + ponto no topo, igual ao do app. */}
          <motion.span
            className="absolute inset-y-0 w-0.5 bg-cream"
            animate={{ left: `${pctAt(active.min)}%` }}
            initial={false}
            transition={spring}
          >
            <i className="absolute -top-0.5 -left-[3px] size-2 rounded-full bg-cream" />
          </motion.span>
        </div>

        {/* Os momentos são botões de verdade — teclado, foco, aria-pressed — e
            ficam ANCORADOS na posição do instante, não espalhados em fileira: o
            rótulo é a legenda daquela marca, e longe dela vira lista solta. */}
        <div className="relative mt-2 h-8 max-[620px]:h-auto max-[620px]:flex max-[620px]:flex-wrap max-[620px]:gap-1.5">
          {MOMENTS.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setId(m.id)}
              aria-pressed={m.id === id}
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
                "rounded-sm px-2 py-1 text-[0.64rem] leading-[1.25] font-extrabold tracking-[0.02em] whitespace-nowrap uppercase",
                "outline-offset-2 transition-colors duration-150 focus-visible:outline-[3px] focus-visible:outline-brass",
                m.id === id
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

      {/* --- o veredito: a frase que o relatório escreve sozinho ---
          A descoberta vem em negrito e a leitura em seguida, partidas em duas
          chaves. A LP não tem renderizador de marcação: a ênfase é JSX, igual ao
          passo do mecanismo no herói. */}
      <p className="mt-3 flex items-start gap-2.5 rounded-lg bg-surface-2 px-3.5 py-3 text-[0.84rem] leading-[1.5] font-[550] text-muted [&>svg]:mt-px [&>svg]:h-[17px] [&>svg]:w-[17px] [&>svg]:shrink-0 [&>svg]:fill-current [&>svg]:text-brass">
        <InfoIcon />
        <span>
          <b className="font-extrabold text-cream">
            {copy.moments[id].finding}
          </b>{" "}
          {copy.moments[id].reading}
        </span>
      </p>
    </div>
  );
}

/**
 * Uma faixa do gráfico: rótulo à esquerda, curva à direita.
 *
 * `floor` desenha o fio do zero — sem ele, a linha do OBS deitada no fundo
 * pareceria "sem dado" em vez de "zerado", que é o contrário do que ela diz.
 */
function Lane({
  d,
  tone,
  label,
  floor,
}: {
  d: string;
  tone: "brass" | "muted";
  label: string;
  floor: boolean;
}) {
  return (
    <div className="relative">
      {/* O rótulo ganha o fundo da faixa atrás: sem isso a curva passa por baixo
          das letras logo no começo do eixo e as duas viram um borrão. */}
      <span className="absolute top-0.5 left-0 z-2 bg-surface pr-2 text-[0.58rem] font-extrabold tracking-[0.08em] text-faint-raised uppercase">
        {label}
      </span>
      <svg
        viewBox={`0 0 ${W} ${LANE_H}`}
        preserveAspectRatio="none"
        className="block h-14 w-full"
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
          d={d}
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
function Frame({ moment, copy }: { moment: Moment; copy: ReplayCopy }) {
  const clock = `${String(Math.floor(moment.min / 60)).padStart(2, "0")}:${String(
    moment.min % 60,
  ).padStart(2, "0")}:12`;

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg border-2 border-border-dry bg-surface bg-[image:var(--halftone-dark)] bg-[length:16px_16px]">
      {moment.frame === "slate" ? (
        // A arte real do slate, a mesma da seção de proteção.
        <div className="grid h-full place-content-center justify-items-center bg-[#14100a] px-4 pb-9 text-center">
          <small className="font-display text-[0.6rem] font-bold tracking-[0.14em] text-brass">
            {copy.slateBrand}
          </small>
          <strong className="mt-2 rotate-[-1.7deg] bg-brass px-[0.16em] pt-[0.02em] pb-[0.08em] font-display text-[clamp(1.3rem,3.4vw,2rem)] leading-none font-extrabold text-brass-ink shadow-[5px_5px_0_0_var(--night)]">
            {copy.slateTitle}
          </strong>
        </div>
      ) : (
        // Sem cena inventada — mas também sem um retângulo de 350px vazio, que foi
        // o que a primeira versão entregou. O que preenche é o que o quadro É:
        // um vídeo PAUSADO num instante. Botão de play e o relógio grande dizem
        // isso na hora, e ainda usam o vocabulário do app em vez de decoração.
        <div className="grid h-full place-content-center justify-items-center px-4 pb-9 text-center">
          <span
            aria-hidden="true"
            className="grid size-14 place-items-center rounded-md bg-brass text-brass-ink shadow-pop"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6 translate-x-px">
              <path d="M8 5l11 7-11 7z" fill="currentColor" />
            </svg>
          </span>
          <strong className="mt-3.5 font-display text-[clamp(1.4rem,3vw,2.1rem)] leading-none font-extrabold text-cream tabular-nums">
            {clock}
          </strong>
          <span className="mt-2 text-[0.72rem] font-[550] text-faint-raised">
            {copy.frameNote}
          </span>
        </div>
      )}

      {/* Relógio e selo: o mesmo par que a réplica da tela Ao vivo carrega. */}
      <span className="absolute top-2 right-2.5 text-[0.54rem] font-extrabold tracking-[0.1em] text-faint-raised uppercase">
        {copy.preview}
      </span>

      {/* A barra de destinos daquele segundo — a leitura que fecha o argumento:
          no quadro do JÁ VOLTO os três continuam NO AR. */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 border-t border-border-dry bg-night/85 px-2.5 py-2">
        {moment.dests.map((d) => (
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

/** As mensagens daquele instante. É o chat gravado voltando a rolar. */
function ChatColumn({ moment, copy }: { moment: Moment; copy: ReplayCopy }) {
  const lines = copy.moments[moment.id].lines;
  return (
    <div className="flex flex-col rounded-lg bg-surface p-[13px]">
      <span className="mb-2.5 text-[0.62rem] font-extrabold tracking-[0.12em] text-faint-raised uppercase">
        {copy.chat}
      </span>
      <div className="flex flex-col gap-[7px]">
        {moment.who.map((line, i) => (
          <p
            key={line.name}
            className="grid grid-cols-[18px_minmax(0,1fr)] items-start gap-2 text-[0.76rem] leading-[1.35] [&_.glyph]:h-[18px] [&_.glyph]:w-[18px]"
          >
            <PlatformGlyph id={line.platform} />
            <span>
              <b className="font-extrabold text-cream">{line.name}</b>
              <span className="ml-1 text-[0.58rem] font-bold text-faint-raised tabular-nums">
                {line.at}
              </span>
              <br />
              <span className="font-[550] text-muted">{lines[i]}</span>
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}
