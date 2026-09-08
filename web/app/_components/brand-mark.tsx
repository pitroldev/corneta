import { Mascot } from "./decor";

type BrandMarkProps = {
  className?: string;
  showName?: boolean;
  tag?: boolean;
  /** Compact spacing is reserved for narrow headers. */
  tight?: boolean;
};

export function BrandMark({
  className = "",
  showName = true,
  tag = true,
  tight = false,
}: BrandMarkProps) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`.trim()}>
      <span className="brand-tile grid size-10 place-items-center rounded-lg bg-brass text-brass-ink [&>svg]:size-[25px]">
        <Mascot />
      </span>
      {showName && (
        <span className={tight ? "max-[400px]:hidden" : undefined}>
          <span className="block font-display text-[1.32rem] leading-none font-extrabold tracking-[-0.02em]">
            Corneta
          </span>
          {tag && (
            <span className="mt-0.5 block text-[0.62rem] font-bold tracking-[0.22em] text-faint uppercase max-[420px]:hidden">
              multi-stream
            </span>
          )}
        </span>
      )}
    </span>
  );
}
