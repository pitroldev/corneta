import { Mascot } from "./decor";

type BrandMarkProps = {
  className?: string;
  showName?: boolean;
  tag?: boolean;
};

/** Marca da Corneta: bloco de latão torto + nome, igual à sidebar do app. */
export function BrandMark({
  className = "",
  showName = true,
  tag = true,
}: BrandMarkProps) {
  return (
    <span className={`brand ${className}`.trim()}>
      <span className="brand-mark">
        <Mascot />
      </span>
      {showName && (
        <span>
          <span className="brand-name">Corneta</span>
          {tag && <span className="brand-tag">multi-stream</span>}
        </span>
      )}
    </span>
  );
}
