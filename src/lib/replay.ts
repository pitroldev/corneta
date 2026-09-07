// ============================================================
// Mapeamento epoch ↔ tempo de vídeo do replay.
//
// NÚCLEO PURO: nada de React, nada de I/O, nada de Tauri. É aqui que moram os bugs
// sutis da feature (âncora faltando, segmento fora de ordem, relógio andando pra trás),
// e é por isso que este arquivo é o mais testado dela — provocar essas falhas numa live
// de verdade é caro e não repetível.
//
// O VOCABULÁRIO, porque três tempos diferentes convivem:
//  • `epoch`  — relógio de parede em ms. É o que TODO o resto do relatório usa.
//  • `global` — ms desde o começo da gravação, somando os segmentos e PULANDO os buracos
//               entre eles. É o que a barra do player mostra.
//  • `local`  — segundos dentro de UM arquivo. É o que o `<video>.currentTime` entende.
// ============================================================

/** Um arquivo de vídeo da sessão. Uma sessão tem N: o gravador pode morrer e retomar. */
export interface ReplaySegment {
  /** Ordem declarada pelo gravador (1, 2, 3…). */
  seg: number;
  /** Epoch do instante que corresponde ao segundo 0 DESTE arquivo. */
  t: number;
  path: string;
  codec: string;
  /** A âncora não veio do `-progress`: foi chutada no spawn (pode errar até o GOP). */
  estimated: boolean;
  /** Pares (epoch, ms gravados) do `recSync`. Sempre contém a âncora inicial (t, 0). */
  syncs: { t: number; out: number }[];
  /** Epoch do fim conhecido. Sem `recEnd`, cai pro último `recSync`. */
  endT: number;
}

/** Salto do relógio do sistema (NTP, horário de verão, ajuste manual). */
export interface ClockJump {
  /** Epoch (já saltado) em que o salto foi percebido. */
  t: number;
  /** Quanto o relógio pulou, em ms. Positivo = pulou pra frente. */
  delta: number;
}

export interface ReplayIndex {
  segments: ReplaySegment[];
  jumps: ClockJump[];
  /** Correção manual do streamer, em ms. Positivo = o vídeo está atrasado e precisa adiantar. */
  offsetMs: number;
  /** Soma das durações dos segmentos (sem os buracos). */
  totalMs: number;
  /** Início de cada segmento no eixo global, mesmo índice de `segments`. */
  starts: number[];
}

/** Posição dentro de um arquivo específico — o que o `<video>` consome. */
export interface ReplayPoint {
  /** Índice em `ReplayIndex.segments` (NÃO é o campo `seg`). */
  index: number;
  /** Segundos dentro daquele arquivo. */
  localSec: number;
}

const EMPTY: ReplayIndex = {
  segments: [],
  jumps: [],
  offsetMs: 0,
  totalMs: 0,
  starts: [],
};

/** Duração de um segmento em ms (nunca negativa). */
const durationOf = (s: ReplaySegment): number => Math.max(0, s.endT - s.t);

/** Desfaz os saltos de relógio: devolve o epoch numa linha do tempo que só anda pra frente.
 *
 *  Os eventos do relatório e as âncoras da gravação vêm do MESMO `SystemTime`, então
 *  corrigir os dois com esta função mantém os dois lados coerentes — o salto se cancela
 *  no mapeamento e para de inflar a duração da sessão. */
export function normalizeEpoch(t: number, jumps: ClockJump[]): number {
  let out = t;
  for (const j of jumps) {
    // O salto já está embutido em tudo que veio DEPOIS dele. Comparar com `j.t` (que é o
    // instante já saltado) é o que evita descontar duas vezes.
    if (t >= j.t) out -= j.delta;
  }
  return out;
}

/** Monta o índice a partir das linhas cruas da sessão.
 *
 *  Ordena por âncora e ignora segmento sem duração: um arquivo de 0 ms é o que sobra
 *  quando o FFmpeg morreu antes do primeiro frame, e ele só atrapalharia a navegação. */
export function buildReplayIndex(
  segments: ReplaySegment[],
  jumps: ClockJump[] = [],
  offsetMs = 0,
): ReplayIndex {
  const clean = segments
    .filter((s) => Number.isFinite(s.t) && durationOf(s) > 0)
    // Ordena pela âncora, não pelo campo `seg`: numa retomada com relógio bagunçado o
    // número pode mentir, o instante não.
    .sort((a, b) => a.t - b.t);
  if (!clean.length) return { ...EMPTY, offsetMs };

  const starts: number[] = [];
  let acc = 0;
  for (const s of clean) {
    starts.push(acc);
    acc += durationOf(s);
  }
  return { segments: clean, jumps, offsetMs, totalMs: acc, starts };
}

/** Converte epoch → ms gravados dentro de UM segmento, interpolando entre âncoras.
 *
 *  Por trechos, não por reta única: em 4h de live o relógio do RTMP e o de parede
 *  divergem, e extrapolar da âncora inicial acumularia o erro justamente no fim. */
function outMsWithin(seg: ReplaySegment, epoch: number): number {
  const pts = [...seg.syncs].sort((a, b) => a.t - b.t);
  if (!pts.length) return epoch - seg.t;
  if (epoch <= pts[0].t) {
    // Antes da primeira âncora: só dá pra assumir tempo real (inclinação 1).
    return pts[0].out + (epoch - pts[0].t);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (epoch <= b.t) {
      const span = b.t - a.t;
      // Duas âncoras no mesmo instante não definem inclinação — cai no valor da esquerda.
      if (span <= 0) return a.out;
      const k = (epoch - a.t) / span;
      return a.out + k * (b.out - a.out);
    }
  }
  const last = pts[pts.length - 1];
  return last.out + (epoch - last.t);
}

/** Inverso de `outMsWithin`: ms gravados → epoch. */
function epochWithin(seg: ReplaySegment, outMs: number): number {
  const pts = [...seg.syncs].sort((a, b) => a.out - b.out);
  if (!pts.length) return seg.t + outMs;
  if (outMs <= pts[0].out) return pts[0].t + (outMs - pts[0].out);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (outMs <= b.out) {
      const span = b.out - a.out;
      if (span <= 0) return a.t;
      const k = (outMs - a.out) / span;
      return a.t + k * (b.t - a.t);
    }
  }
  const last = pts[pts.length - 1];
  return last.t + (outMs - last.out);
}

/** Epoch → posição global (ms desde o início da gravação), ou `null` se o instante não
 *  foi gravado.
 *
 *  Instante caído num BURACO entre segmentos não devolve `null`: encosta na borda mais
 *  próxima. Clicar num evento que aconteceu enquanto o gravador estava reiniciando deve
 *  levar o vídeo pra beirada daquele buraco, não recusar o clique em silêncio. */
export function globalAtEpoch(idx: ReplayIndex, epoch: number): number | null {
  if (!idx.segments.length) return null;
  const e = normalizeEpoch(epoch, idx.jumps) + idx.offsetMs;
  for (let i = 0; i < idx.segments.length; i++) {
    const seg = idx.segments[i];
    const t0 = normalizeEpoch(seg.t, idx.jumps);
    const t1 = normalizeEpoch(seg.endT, idx.jumps);
    if (e < t0) {
      // Antes do primeiro segmento é "fora"; entre dois é buraco → encosta no início deste.
      return i === 0 ? null : idx.starts[i];
    }
    if (e <= t1) {
      const out = outMsWithin(seg, e - t0 + seg.t);
      const local = Math.max(0, Math.min(durationOf(seg), out));
      return idx.starts[i] + local;
    }
  }
  return null; // depois do fim da gravação
}

/** Posição global → arquivo + segundo dentro dele. */
export function pointAtGlobal(
  idx: ReplayIndex,
  globalMs: number,
): ReplayPoint | null {
  if (!idx.segments.length) return null;
  const g = Math.max(0, Math.min(idx.totalMs, globalMs));
  for (let i = idx.segments.length - 1; i >= 0; i--) {
    if (g >= idx.starts[i]) {
      const local = Math.min(g - idx.starts[i], durationOf(idx.segments[i]));
      return { index: i, localSec: local / 1000 };
    }
  }
  return { index: 0, localSec: 0 };
}

/** Posição global → epoch. É o caminho de volta: o vídeo tocando move o cursor dos gráficos. */
export function epochAtGlobal(
  idx: ReplayIndex,
  globalMs: number,
): number | null {
  const p = pointAtGlobal(idx, globalMs);
  if (!p) return null;
  const seg = idx.segments[p.index];
  const raw = epochWithin(seg, p.localSec * 1000);
  // Desfaz o offset manual e devolve pro relógio ORIGINAL (com saltos), porque é nele
  // que as amostras do relatório estão indexadas.
  return denormalizeEpoch(raw - idx.offsetMs, idx.jumps);
}

/** Inverso de `normalizeEpoch` — volta pro relógio cru, com os saltos de novo embutidos. */
export function denormalizeEpoch(t: number, jumps: ClockJump[]): number {
  let out = t;
  // Ao contrário: cada salto cujo instante NORMALIZADO já passou volta a somar.
  for (const j of jumps) {
    if (t >= j.t - j.delta) out += j.delta;
  }
  return out;
}

/** Índice da amostra do relatório mais próxima de um epoch (busca binária).
 *
 *  É o que liga o vídeo aos gráficos: o eixo X deles é índice de amostra, não tempo. */
export function sampleIndexAt(times: number[], epoch: number): number | null {
  if (!times.length) return null;
  let lo = 0;
  let hi = times.length - 1;
  if (epoch <= times[0]) return 0;
  if (epoch >= times[hi]) return hi;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] === epoch) return mid;
    if (times[mid] < epoch) lo = mid;
    else hi = mid;
  }
  return epoch - times[lo] <= times[hi] - epoch ? lo : hi;
}

/** Como `sampleIndexAt`, mas FRACIONÁRIO — o cursor precisa andar entre duas amostras.
 *
 *  Arredondar aqui faria o cursor pular de 2 em 2 segundos enquanto o vídeo corre liso,
 *  e a bandeirinha ficaria sempre um pouco atrás do que se está vendo. */
export function fractionalIndexAt(
  times: number[],
  epoch: number,
): number | null {
  if (!times.length) return null;
  const i = sampleIndexAt(times, epoch);
  if (i == null) return null;
  // Vizinho na direção do instante pedido; sem ele (ponta da série) devolve o inteiro.
  const j = times[i] <= epoch ? i + 1 : i - 1;
  if (j < 0 || j >= times.length) return i;
  const span = times[j] - times[i];
  if (span === 0) return i;
  const k = (epoch - times[i]) / span;
  return i + k * (j - i);
}

/** A gravação cobre este instante? Usado pra decidir se um evento é clicável. */
export const isCovered = (idx: ReplayIndex, epoch: number): boolean =>
  globalAtEpoch(idx, epoch) != null;

/** Algum segmento veio com âncora chutada? A UI avisa que a sincronia pode estar torta. */
export const hasEstimatedAnchor = (idx: ReplayIndex): boolean =>
  idx.segments.some((s) => s.estimated);

/** Codecs que o webview NÃO toca. Hoje o motor só emite h264, mas registrar o codec na
 *  âncora é o que faz o player AVISAR no dia em que isso mudar, em vez de mostrar preto. */
const PLAYABLE = new Set(["h264", "avc1", "aac", ""]);
export const isPlayableCodec = (codec: string): boolean =>
  PLAYABLE.has(codec.toLowerCase());
export const hasUnplayableCodec = (idx: ReplayIndex): boolean =>
  idx.segments.some((s) => s.codec && !isPlayableCodec(s.codec));
