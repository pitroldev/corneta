import { cn } from "../lib/utils";

/** Mascote da Corneta — o megafone. Herda a cor via currentColor. */
export function Mascot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M3.4 9.1 L13 5.9 V18.1 L3.4 14.9 Z" fill="currentColor" />
      <rect
        x="4.7"
        y="13.9"
        width="2.5"
        height="4.6"
        rx="1.1"
        fill="currentColor"
      />
      <path
        d="M15.6 8.4a5 5 0 0 1 0 7.2"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M17.8 6.4a8 8 0 0 1 0 11.2"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Ondas sonoras concêntricas (mesmo centro), abrindo para a direita. */
export function SoundWaves({
  className,
  count = 4,
}: {
  className?: string;
  count?: number;
}) {
  const cx = 6;
  const cy = 100;
  const a = (52 * Math.PI) / 180; // meia-abertura do arco
  return (
    <svg viewBox="0 0 200 200" className={className} fill="none" aria-hidden>
      {Array.from({ length: count }).map((_, i) => {
        const r = 32 + i * 30;
        const x1 = (cx + r * Math.cos(-a)).toFixed(1);
        const y1 = (cy + r * Math.sin(-a)).toFixed(1);
        const x2 = (cx + r * Math.cos(a)).toFixed(1);
        const y2 = (cy + r * Math.sin(a)).toFixed(1);
        return (
          <path
            key={i}
            d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            opacity={0.6 - i * 0.1}
          />
        );
      })}
    </svg>
  );
}

/** Faixa decorativa de ondas no canto de uma seção/herói. */
export function WaveCorner({ className }: { className?: string }) {
  return (
    <SoundWaves
      className={cn(
        "pointer-events-none absolute select-none text-brass",
        className,
      )}
    />
  );
}
