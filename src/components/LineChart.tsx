// Gráfico de linhas em SVG (zero-dependência). Multi-série sobre um eixo de
// tempo (índice de amostra), com marcadores de evento e tratamento de gaps.

export interface ChartSeries {
  label: string;
  color: string;
  values: (number | null)[];
}

export interface ChartMarker {
  index: number;
  color: string;
}

export function LineChart({
  series,
  n,
  height = 160,
  yMax: yMaxProp,
  markers = [],
  formatValue,
  className,
}: {
  series: ChartSeries[];
  /** Número de amostras (comprimento do eixo x). */
  n: number;
  height?: number;
  yMax?: number;
  markers?: ChartMarker[];
  formatValue?: (v: number) => string;
  className?: string;
}) {
  const W = 640;
  const H = height;
  const padL = 40;
  const padR = 10;
  const padT = 10;
  const padB = 14;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  let peak = 1;
  for (const s of series) for (const v of s.values) if (v != null && v > peak) peak = v;
  const yMax = yMaxProp ?? peak * 1.1;
  const xAt = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => padT + (1 - Math.min(v, yMax) / yMax) * innerH;
  const fmt = formatValue ?? ((v: number) => `${Math.round(v)}`);

  // Subamostra séries longas (mantém o SVG leve).
  const MAX_POINTS = 600;
  const indices = (len: number) => {
    if (len <= MAX_POINTS) return Array.from({ length: len }, (_, i) => i);
    const step = len / MAX_POINTS;
    return Array.from({ length: MAX_POINTS }, (_, k) => Math.floor(k * step));
  };

  const pathFor = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    let prev = -1;
    for (const i of indices(vals.length)) {
      if (pen && prev >= 0) {
        for (let k = prev + 1; k < i; k++) {
          if (vals[k] == null) {
            pen = false;
            break;
          }
        }
      }
      const v = vals[i];
      if (v == null) {
        pen = false;
      } else {
        d += `${pen ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)} `;
        pen = true;
      }
      prev = i;
    }
    return d.trim();
  };

  const ticks = [1, 0.5, 0].map((f) => yMax * f);

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="overflow-visible">
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
            <text x={padL - 6} y={yAt(tv) + 3} textAnchor="end" className="fill-ink-faint text-[10px]">
              {fmt(tv)}
            </text>
          </g>
        ))}

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
            d={pathFor(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {series.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s, i) => (
            <span key={i} className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
