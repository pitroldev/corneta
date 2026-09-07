"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ObsMark, PlatformGlyph } from "./decor";
import { cn, State } from "./ui";

type PlatId = "twitch" | "youtube" | "kick";

const OUT: { id: PlatId; name: string; branch: string }[] = [
  // Path endpoints match the three destination centers in the adjacent grid.
  { id: "twitch", name: "Twitch", branch: "M0 50H12V14.79H34" },
  { id: "youtube", name: "YouTube", branch: "M0 50H34" },
  { id: "kick", name: "Kick", branch: "M0 50H12V85.21H34" },
];

const ROW =
  "grid min-h-[42px] w-full grid-cols-[26px_1fr_auto] items-center gap-2.5 rounded-md px-[9px] py-1.5 text-left text-[0.8rem] font-bold " +
  "[&_.glyph]:h-[26px] [&_.glyph]:w-[26px]";

export interface RouteFanCopy {
  live: string;
  down: string;
  hint: string;
}

export function RouteFan({ copy }: { copy: RouteFanCopy }) {
  const reduce = useReducedMotion() ?? false;
  const [down, setDown] = useState<Partial<Record<PlatId, boolean>>>({
    kick: true,
  });

  return (
    <div>
      <div className="grid grid-cols-[62px_34px_1fr] items-center max-[760px]:grid-cols-[54px_26px_1fr]">
        {/* Optical padding compensates for Baloo's unused descender space. */}
        <span className="grid size-[62px] place-items-center gap-1 rounded-md bg-brass pt-[5px] font-display text-[1.05rem] font-extrabold text-brass-ink shadow-pop-sm max-[760px]:size-[54px] max-[760px]:text-[0.92rem] [&>svg]:h-5 [&>svg]:w-5 [&>svg]:fill-current">
          <ObsMark />
          <span className="leading-none">OBS</span>
        </span>

        {/* Stretch the SVG with the destination grid so branch endpoints stay aligned. */}
        <span
          className="self-stretch [&>svg]:block [&>svg]:h-full [&>svg]:w-[34px]"
          aria-hidden="true"
        >
          <svg viewBox="0 0 34 100" preserveAspectRatio="none">
            {OUT.map((o) => (
              <motion.path
                key={o.id}
                d={o.branch}
                fill="none"
                strokeWidth={2.5}
                vectorEffect="non-scaling-stroke"
                initial={false}
                animate={{
                  stroke: down[o.id] ? "var(--warn)" : "var(--brass)",
                  opacity: down[o.id] ? 0.55 : 1,
                }}
                transition={{ duration: reduce ? 0 : 0.35 }}
              />
            ))}
          </svg>
        </span>

        <div className="flex flex-col gap-2">
          {OUT.map((o) => {
            const off = !!down[o.id];
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={!off}
                onClick={() =>
                  setDown((cur) => ({ ...cur, [o.id]: !cur[o.id] }))
                }
                className={cn(
                  ROW,
                  "cursor-pointer outline-offset-2 transition-colors duration-150",
                  "hover:bg-surface-3 focus-visible:outline-[3px] focus-visible:outline-brass",
                  off ? "bg-surface-3" : "bg-surface-2",
                )}
              >
                <PlatformGlyph id={o.id} />
                <span>{o.name}</span>
                <motion.span
                  key={off ? "off" : "on"}
                  initial={reduce ? false : { scale: 0.72, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  <State tone={off ? "warn" : "ok"}>
                    <i
                      className={cn(
                        off &&
                          !reduce &&
                          "animate-[soft-pulse_1.2s_ease-in-out_infinite]",
                      )}
                    />{" "}
                    {off ? copy.down : copy.live}
                  </State>
                </motion.span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-[0.62rem] font-bold tracking-[0.04em] text-faint-raised">
        {copy.hint}
      </p>
    </div>
  );
}
