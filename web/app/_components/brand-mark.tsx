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
    <span className={`flex items-center gap-2.5 ${className}`.trim()}>
      <span className="grid size-10 -rotate-3 place-items-center rounded-lg bg-brass text-brass-ink shadow-pop-brass [&>svg]:size-[25px]">
        <Mascot />
      </span>
      {showName && (
        <span>
          <span className="block font-display text-[1.32rem] leading-none font-extrabold tracking-[-0.02em]">
            Corneta
          </span>
          {tag && (
            <span className="mt-0.5 block text-[0.62rem] font-bold tracking-[0.22em] text-faint uppercase">
              multi-stream
            </span>
          )}
        </span>
      )}
    </span>
  );
}
