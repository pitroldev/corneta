// ============================================================
// Geometria de série temporal → caminho SVG.
//
// Vive fora do LineChart porque o relatório exportado em HTML desenha os MESMOS
// gráficos sem React nenhum. Duplicar a matemática deixaria os dois desenhos
// divergindo em silêncio na primeira correção de borda.
// ============================================================

/** Acima disso a série é subamostrada: 600 pontos já saturam a largura do gráfico,
 *  e uma live de 4h tem ~7.200 amostras. */
export const MAX_POINTS = 600;

export function sampleIndices(len: number): number[] {
  if (len <= MAX_POINTS) return Array.from({ length: len }, (_, i) => i);
  const step = len / MAX_POINTS;
  return Array.from({ length: MAX_POINTS }, (_, k) => Math.floor(k * step));
}

export interface PathGeometry {
  /** Comprimento do eixo X em amostras (não é o tamanho de `values`: séries de
   *  eixos diferentes — audiência a cada 30s — compartilham o mesmo desenho). */
  n: number;
  yMax: number;
  padL: number;
  padT: number;
  innerW: number;
  innerH: number;
}

export const xAt = (i: number, g: PathGeometry): number =>
  g.padL + (g.n <= 1 ? 0 : (i / (g.n - 1)) * g.innerW);

export const yAt = (v: number, g: PathGeometry): number =>
  g.padT + (1 - Math.min(v, g.yMax) / g.yMax) * g.innerH;

/** Maior valor de todas as séries, com 10% de folga no topo. */
export function peakOf(series: { values: (number | null)[] }[]): number {
  let peak = 1;
  for (const s of series)
    for (const v of s.values) if (v != null && v > peak) peak = v;
  return peak * 1.1;
}

/** Caminho SVG de uma série, levantando a caneta nos buracos.
 *
 *  O trecho pulado entre dois pontos SUBAMOSTRADOS também conta: se qualquer amostra
 *  entre eles for nula, a linha não pode ser contínua ali — senão a subamostragem
 *  esconderia justamente a queda que o relatório existe pra mostrar. */
export function buildPath(values: (number | null)[], g: PathGeometry): string {
  let d = "";
  let pen = false;
  let prev = -1;
  for (const i of sampleIndices(values.length)) {
    if (pen && prev >= 0) {
      for (let k = prev + 1; k < i; k++) {
        if (values[k] == null) {
          pen = false;
          break;
        }
      }
    }
    const v = values[i];
    if (v == null) {
      pen = false;
    } else {
      d += `${pen ? "L" : "M"}${xAt(i, g).toFixed(1)},${yAt(v, g).toFixed(1)} `;
      pen = true;
    }
    prev = i;
  }
  return d.trim();
}
