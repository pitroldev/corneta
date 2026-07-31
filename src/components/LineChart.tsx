// Gráfico de linhas em SVG (zero-dependência). Multi-série sobre um eixo de
// tempo (índice de amostra), com marcadores de evento, tratamento de gaps,
// rótulos de tempo no eixo X, linha de referência e tooltip no hover.
import { useMemo, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { buildPath, peakOf, type PathGeometry } from "../lib/chartPath";

export interface ChartSeries {
  label: string;
  color: string;
  values: (number | null)[];
}

export interface ChartMarker {
  index: number;
  color: string;
}

/** Linha horizontal tracejada de referência (ex.: zona de perigo da CPU). */
export interface ChartRefLine {
  value: number;
  label: string;
}

export function LineChart({
  series,
  n,
  height = 160,
  yMax: yMaxProp,
  markers = [],
  formatValue,
  formatX,
  refLine,
  className,
  playhead,
  onSeek,
}: {
  series: ChartSeries[];
  /** Número de amostras (comprimento do eixo x). */
  n: number;
  height?: number;
  yMax?: number;
  markers?: ChartMarker[];
  formatValue?: (v: number) => string;
  /** Rótulo do eixo X pra amostra i (ex.: tempo relativo ao início). Liga eixo X + tooltip com tempo. */
  formatX?: (i: number) => string;
  refLine?: ChartRefLine;
  className?: string;
  /** Cursor do replay, em índice de amostra (fracionário: o vídeo anda entre amostras).
   *  `null` = sem gravação ou instante fora dela. */
  playhead?: number | null;
  /** Clique no gráfico → salta o vídeo pra aquela amostra. Sem isso o gráfico é só leitura. */
  onSeek?: (i: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 640;
  const H = height;
  const padL = 40;
  const padR = 10;
  const padT = 10;
  const padB = formatX ? 26 : 14; // espaço extra pros rótulos de tempo
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const yMax = useMemo(() => yMaxProp ?? peakOf(series), [series, yMaxProp]);
  const xAt = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => padT + (1 - Math.min(v, yMax) / yMax) * innerH;
  const fmt = formatValue ?? ((v: number) => `${Math.round(v)}`);

  // Hover muda dezenas de vezes por segundo. A geometria das séries não muda junto, então os
  // paths (e a varredura de até milhares de amostras) ficam memorizados entre esses renders.
  // A geometria é montada AQUI dentro: como objeto novo a cada render, na lista de
  // dependências ela invalidaria o memo justamente a cada hover.
  const paths = useMemo(() => {
    const geo: PathGeometry = { n, yMax, padL, padT, innerW, innerH };
    return series.map((s) => buildPath(s.values, geo));
  }, [innerH, innerW, n, series, yMax]);

  const ticks = [1, 0.5, 0].map((f) => yMax * f);
  // 4 rótulos de tempo (início · 1/3 · 2/3 · fim), sem repetir índice em séries curtas.
  const xTicks =
    formatX && n > 1
      ? [...new Set([0, 1 / 3, 2 / 3, 1].map((f) => Math.round(f * (n - 1))))]
      : [];

  // O SVG escala via viewBox: mapeia o mouse de px da tela → coordenada do gráfico
  // pela matriz real do SVG (getScreenCTM), que já desconta o letterbox do
  // preserveAspectRatio — regra de três com o rect erraria perto das bordas.
  const indexAtEvent = (e: React.MouseEvent<SVGSVGElement>): number | null => {
    const el = svgRef.current;
    if (!el || n <= 1) return null;
    const ctm = el.getScreenCTM();
    let x: number;
    if (ctm) {
      const pt = el.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      x = pt.matrixTransform(ctm.inverse()).x;
    } else {
      const rect = el.getBoundingClientRect();
      x = ((e.clientX - rect.left) / rect.width) * W;
    }
    const i = Math.round(((x - padL) / innerW) * (n - 1));
    return Math.max(0, Math.min(n - 1, i));
  };

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const i = indexAtEvent(e);
    if (i != null) setHover(i);
  };

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onSeek) return;
    const i = indexAtEvent(e);
    if (i != null) onSeek(i);
  };

  const renderTooltip = () => {
    if (hover == null) return null;
    const rows = series
      .map((s) => ({ label: s.label, color: s.color, v: s.values[hover] }))
      .filter(
        (r): r is { label: string; color: string; v: number } => r.v != null,
      );
    if (!rows.length) return null;
    const bx = xAt(hover);
    const title = formatX ? formatX(hover) : null;
    const lines = rows.map((r) => `${r.label}: ${fmt(r.v)}`);
    // largura estimada por caracteres (canvas de medição seria exagero aqui)
    const wEst =
      Math.max(...lines.map((t) => t.length), title?.length ?? 0) * 6 + 16;
    const lineH = 13;
    const bh = (rows.length + (title ? 1 : 0)) * lineH + 9;
    const boxX = bx + 10 + wEst > W - padR ? bx - 10 - wEst : bx + 10;
    const boxY = padT + 2;
    return (
      <g pointerEvents="none">
        <line
          x1={bx}
          y1={padT}
          x2={bx}
          y2={H - padB}
          className="text-ink-faint"
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
        {rows.map((r, i) => (
          <circle key={i} cx={bx} cy={yAt(r.v)} r={3} fill={r.color} />
        ))}
        <rect
          x={boxX}
          y={boxY}
          width={wEst}
          height={bh}
          rx={4}
          className="fill-surface-3 stroke-border"
          strokeWidth={1}
          opacity={0.95}
        />
        {title && (
          <text
            x={boxX + 8}
            y={boxY + 13}
            className="fill-ink text-[10px] font-bold"
          >
            {title}
          </text>
        )}
        {rows.map((r, i) => (
          <text
            key={i}
            x={boxX + 8}
            y={boxY + 13 + (i + (title ? 1 : 0)) * lineH}
            fill={r.color}
            className="text-[10px] font-semibold"
          >
            {lines[i]}
          </text>
        ))}
      </g>
    );
  };

  return (
    <div
      className={cn(
        "[contain-intrinsic-size:auto_200px] [content-visibility:auto]",
        className,
      )}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        className={cn("overflow-visible", onSeek && "cursor-pointer")}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onClick={onClick}
      >
        {ticks.map((tv, i) => (
          <g key={i}>
            <line
              x1={padL}
              y1={yAt(tv)}
              x2={W - padR}
              y2={yAt(tv)}
              className="text-border-soft"
              stroke="currentColor"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={padL - 6}
              y={yAt(tv) + 3}
              textAnchor="end"
              className="fill-ink-faint text-[10px]"
            >
              {fmt(tv)}
            </text>
          </g>
        ))}

        {formatX &&
          xTicks.map((ti, k) => (
            <text
              key={`x${k}`}
              x={xAt(ti)}
              y={H - padB + 14}
              textAnchor={
                k === 0 ? "start" : k === xTicks.length - 1 ? "end" : "middle"
              }
              className="fill-ink-faint text-[10px]"
            >
              {formatX(ti)}
            </text>
          ))}

        {refLine && refLine.value <= yMax && (
          <g>
            <line
              x1={padL}
              y1={yAt(refLine.value)}
              x2={W - padR}
              y2={yAt(refLine.value)}
              className="text-bad"
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
              opacity={0.7}
            />
            <text
              x={W - padR}
              y={yAt(refLine.value) - 4}
              textAnchor="end"
              className="fill-bad text-[10px] font-semibold"
            >
              {refLine.label}
            </text>
          </g>
        )}

        {markers.map((m, i) => (
          <line
            key={`m${i}`}
            x1={xAt(m.index)}
            y1={padT}
            x2={xAt(m.index)}
            y2={H - padB}
            stroke={m.color}
            strokeWidth={1.5}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
            opacity={0.55}
          />
        ))}

        {series.map((s, i) => (
          <path
            key={`s${i}`}
            d={paths[i]}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Cursor do replay. Desenhado DEPOIS das séries e ANTES do tooltip: tem que
            ficar por cima da linha (é a informação que o olho procura enquanto o vídeo
            corre) e por baixo do tooltip (que é o que o mouse pediu agora). */}
        {playhead != null && n > 1 && (
          <g pointerEvents="none">
            <line
              x1={xAt(playhead)}
              y1={padT}
              x2={xAt(playhead)}
              y2={H - padB}
              className="text-brass"
              stroke="currentColor"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={xAt(playhead)}
              cy={padT}
              r={3.5}
              className="fill-brass"
            />
          </g>
        )}

        {renderTooltip()}
      </svg>

      {series.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s, i) => (
            <span
              key={i}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted"
            >
              <span
                className="size-2.5 rounded-sm"
                style={{ background: s.color }}
              />{" "}
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
