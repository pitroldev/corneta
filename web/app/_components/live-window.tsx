"use client";

import { useRef, useState } from "react";
import { fill, group } from "@/lib/i18n";
import { useCalm, useHeartbeat } from "./use-motion";
import { PlatformGlyph } from "./decor";
import { CheckIcon } from "./icons";
import { cn } from "./ui";

export interface LiveWindowCopy {
  kicker: string;
  title: string;
  stateLive: string;
  statUptime: string;
  statSending: string;
  statDrops: string;
  verdict: string;
  stop: string;
  metrics: string;
  sep: string;
  chatTitle: string;
  chatPlatforms: string;
  compose: string;
  send: string;
  messages: { from: string; who: string; platform: PlatId; text: string }[];
}

type PlatId = "twitch" | "youtube" | "kick";

const TARGETS: { id: PlatId; name: string; target: number }[] = [
  { id: "twitch", name: "Twitch", target: 6000 },
  { id: "youtube", name: "YouTube", target: 6000 },
  { id: "kick", name: "Kick", target: 6000 },
];

const START_SEC = 1 * 3600 + 42 * 60 + 8;

const clock = (s: number) =>
  [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");

// Deterministic values keep server rendering and hydration identical.
const wobble = (target: number, tick: number, seed: number) =>
  target +
  Math.round(
    Math.sin((tick + seed * 2.1) * 1.7) * 26 + Math.sin(tick * 0.7 + seed) * 12,
  );

export function LivePanel({ copy }: { copy: LiveWindowCopy }) {
  const calm = useCalm();
  const ref = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  useHeartbeat(ref, 1000, !calm, () => setTick((n) => n + 1));

  const secs = START_SEC + tick;
  const rates = TARGETS.map((t, i) => wobble(t.target, tick, i));
  const totalMbps = (rates.reduce((a, b) => a + b, 0) + 512) / 1000;

  return (
    <div
      ref={ref}
      className="flex min-w-0 flex-col gap-3.5 p-[18px] max-[760px]:p-[15px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="mb-[5px] block text-[0.6rem] font-extrabold tracking-[0.16em] text-brass uppercase">
            {copy.kicker}
          </span>
          <strong className="block font-display text-2xl leading-[1.05] font-extrabold tracking-[-0.02em]">
            {copy.title}
          </strong>
        </div>
        <span className="flex shrink-0 items-center gap-2 rounded-sm bg-live px-2.5 py-1.5 text-[0.62rem] font-extrabold tracking-[0.1em] text-white uppercase shadow-pop">
          <i
            className={cn(
              "size-[7px] rounded-full bg-white",
              !calm && "animate-[live-pulse_1.4s_ease-out_infinite]",
            )}
          />
          {copy.stateLive}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 max-[760px]:grid-cols-2 max-[760px]:[&>div:last-child]:col-span-2">
        <Stat label={copy.statUptime} value={clock(secs)} />
        <Stat
          label={copy.statSending}
          value={`${totalMbps.toFixed(1).replace(".", ",")} Mb/s`}
        />
        <Stat label={copy.statDrops} value="0" tone="ok" />
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {TARGETS.map((target, i) => (
          <div
            className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-[11px] rounded-md bg-surface-2 px-[11px] py-[9px] [&_.glyph]:h-[38px] [&_.glyph]:w-[38px]"
            key={target.id}
          >
            <PlatformGlyph id={target.id} />
            <div className="min-w-0">
              <strong className="block font-display text-[0.92rem] leading-[1.1] font-bold">
                {target.name}
              </strong>
              <small className="mt-0.5 block text-[0.62rem] font-[550] text-faint-raised tabular-nums">
                {fill(copy.metrics, {
                  kbps: group(rates[i], copy.sep),
                  drops: "0",
                })}
              </small>
            </div>
            <span className="flex items-center gap-2.5">
              <Meter value={rates[i] - target.target} />
              <span className="flex items-center gap-1.5 text-[0.62rem] font-extrabold tracking-[0.04em] text-ok uppercase max-[860px]:hidden">
                <i className="size-[7px] rounded-full bg-ok" />
                {copy.stateLive}
              </span>
            </span>
          </div>
        ))}
      </div>

      <p
        className={cn(
          "flex items-center gap-2 border-t border-border-soft pt-3 text-[0.72rem] leading-[1.4] font-[550] text-muted",
          "[&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:shrink-0 [&>svg]:stroke-ok [&>svg]:[stroke-width:3] [&>svg]:fill-none [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round]",
        )}
      >
        <CheckIcon />
        {copy.verdict}
      </p>

      <div className="flex min-h-[44px] items-center justify-center gap-2.5 rounded-md border border-border-dry bg-surface-2 font-display text-[0.98rem] font-bold text-muted">
        <span className="size-[9px] rounded-sm bg-muted" />
        {copy.stop}
      </div>
    </div>
  );
}

function Meter({ value }: { value: number }) {
  const lit = value < -12 ? 4 : 5;
  return (
    <span className="flex items-end gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <i
          key={i}
          className={cn(
            "w-[3px] rounded-[1px] transition-colors duration-500 ease-out",
            i < lit ? "bg-ok" : "bg-surface-3",
          )}
          style={{ height: `${5 + i * 2.5}px` }}
        />
      ))}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok";
}) {
  return (
    <div className="border-t-2 border-brass/55 bg-surface-2 px-[11px] py-2">
      <span className="block text-[0.55rem] font-extrabold tracking-[0.08em] text-faint-raised uppercase">
        {label}
      </span>
      <strong
        className={cn(
          "mt-0.5 block font-display text-[1.06rem] leading-[1.1] font-extrabold tabular-nums",
          tone === "ok" && "text-ok",
        )}
      >
        {value}
      </strong>
    </div>
  );
}

export function LiveChat({ copy }: { copy: LiveWindowCopy }) {
  const calm = useCalm();
  const ref = useRef<HTMLDivElement>(null);
  const [head, setHead] = useState(0);
  useHeartbeat(ref, 3000, !calm, () => setHead((n) => n + 1));

  const n = copy.messages.length;
  const shown = Array.from({ length: 6 }, (_, i) => {
    const idx = (head + i) % n;
    return { ...copy.messages[idx], key: `${head + i}` };
  });

  return (
    <div
      ref={ref}
      className="flex min-w-0 flex-col border-l border-border-soft bg-panel px-[15px] py-[18px] max-[1180px]:hidden"
      aria-hidden="true"
    >
      <div className="mb-4 flex items-start justify-between gap-2.5">
        <span>
          <strong className="block font-display text-[0.9rem] leading-none font-bold">
            {copy.chatTitle}
          </strong>
          <small className="mt-[3px] block text-[0.56rem] font-bold tracking-[0.08em] text-faint uppercase">
            {copy.chatPlatforms}
          </small>
        </span>
      </div>

      {/* Fix the chat viewport height so incoming messages cannot resize the window. */}
      {/* Use a mask for fading; an opacity animation would override per-row opacity. */}
      <div className="flex flex-1 flex-col justify-end gap-[13px] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_38px)]">
        {shown.map((m) => (
          <div
            key={m.key}
            className={cn(
              "grid grid-cols-[24px_minmax(0,1fr)] gap-2 [&_.glyph]:h-6 [&_.glyph]:w-6",
              !calm &&
                "animate-[chat-in_420ms_cubic-bezier(0.16,1,0.3,1)_both]",
            )}
          >
            <PlatformGlyph id={m.platform} />
            <div>
              <strong className="block text-[0.6rem] font-extrabold text-muted">
                {m.from} · {m.who}
              </strong>
              <p className="mt-0.5 text-[0.72rem] leading-[1.4] font-[550]">
                {m.text}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3.5 flex min-h-[34px] items-center justify-between gap-2 rounded-md border border-border-dry px-2.5 text-[0.62rem] font-[550] text-faint">
        {copy.compose}
        <b className="text-brass">{copy.send}</b>
      </div>
    </div>
  );
}
