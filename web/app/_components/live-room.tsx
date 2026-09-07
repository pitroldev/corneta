"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { PlatformGlyph } from "./decor";
import { EyeIcon } from "./icons";
import { Chip, cn, DemoLabel, State } from "./ui";
import { useCalm, useHeartbeat, useOnScreen } from "./use-motion";
import { fill, group } from "@/lib/i18n";

// Avoid pathLength on stretched SVG viewBoxes with non-scaling strokes; animate position or opacity instead.

// Explicit light text prevents inheritance from the surrounding paper section.
const PANEL = "rounded-lg bg-surface p-[18px] text-cream shadow-pop-ink-lg";

const ROW =
  "grid w-full grid-cols-[30px_minmax(0,1fr)_auto] max-[760px]:grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md bg-surface-2 px-2.5 py-[9px] text-left not-first:mt-[7px] " +
  "[&_.glyph]:h-[30px] [&_.glyph]:w-[30px] " +
  "[&>div>strong]:block [&>div>strong]:font-display [&>div>strong]:text-[0.84rem] [&>div>strong]:font-bold " +
  "[&>div>small]:mt-0.5 [&>div>small]:block [&>div>small]:text-[0.62rem] [&>div>small]:font-[550] [&>div>small]:tabular-nums [&>div>small]:text-faint-raised";

type PlatId = "twitch" | "youtube" | "kick" | "tiktok";

const ROWS: { id: PlatId; name: string; target: number }[] = [
  { id: "twitch", name: "Twitch", target: 6000 },
  { id: "youtube", name: "YouTube", target: 6000 },
  { id: "kick", name: "Kick", target: 6000 },
  { id: "tiktok", name: "TikTok", target: 4500 },
];

const KICK_CYCLE = 26;
const KICK_DOWN = 10;

// Deterministic values keep server rendering and hydration identical.
const wobble = (target: number, tick: number, seed: number) =>
  target +
  Math.round(
    Math.sin((tick + seed * 2.1) * 1.7) * 26 + Math.sin(tick * 0.7 + seed) * 12,
  );

export interface LiveRoomCopy {
  label: string;
  tag: string;
  metrics: string;
  onAir: string;
  reconnecting: string;
  back: string;
  paused: string;
  pausedState: string;
  cpu: string;
  gpu: string;
  watching: string;
  hint: string;
  sep: string;
}

export interface ReportChartCopy {
  label: string;
  tag: string;
  chartAria: string;
  scrub: string;
  hint: string;
  watching: string;
  peak: string;
  average: string;
  messages: string;
  raid: string;
  drop: string;
  sep: string;
}

// Scale the bar instead of changing width to avoid layout work on every tick.
function Meter({
  label,
  pct,
  ok = false,
  calm,
}: {
  label: string;
  pct: number;
  ok?: boolean;
  calm: boolean;
}) {
  return (
    <span className="flex items-center gap-[7px] text-[0.66rem] font-extrabold tracking-[0.04em] whitespace-nowrap text-muted uppercase">
      {label}
      <i className="block h-[7px] w-14 overflow-hidden bg-surface-3">
        <motion.b
          className={cn(
            "block h-full w-full origin-left",
            ok ? "bg-ok" : "bg-brass",
          )}
          initial={false}
          animate={{ scaleX: pct / 100 }}
          transition={
            calm
              ? { duration: 0 }
              : { type: "spring", stiffness: 130, damping: 21 }
          }
        />
      </i>
      <span className="w-[3.4ch] text-right tabular-nums">{pct}%</span>
    </span>
  );
}

export function LiveRoom({ copy }: { copy: LiveRoomCopy }) {
  const calm = useCalm();
  const box = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  const [off, setOff] = useState<Partial<Record<PlatId, boolean>>>({
    tiktok: true,
  });

  useHeartbeat(box, 1000, !calm, () => setTick((n) => n + 1));

  const kickPhase = tick % KICK_CYCLE;
  const kickDown = kickPhase < KICK_DOWN;
  const kickDrops = Math.floor(tick / KICK_CYCLE) + 1;

  const active = ROWS.filter((r) => !off[r.id]).length;
  const cpu = 6 + active * 4 + Math.round(Math.sin(tick * 0.9) * 2);
  const gpu =
    11 + Math.round(active * 6.7) + Math.round(Math.sin(tick * 0.6 + 1) * 2);
  const viewers = Math.round(
    (1284 +
      Math.round(Math.sin(tick * 0.33) * 46 + Math.sin(tick * 0.11) * 28)) *
      (active / 3),
  );

  const toggle = (id: PlatId) => setOff((cur) => ({ ...cur, [id]: !cur[id] }));

  return (
    <div ref={box} className={PANEL}>
      <DemoLabel>
        <span>{copy.label}</span>
        <span>{copy.tag}</span>
      </DemoLabel>

      {ROWS.map((row, i) => {
        const isOff = off[row.id];
        const down = !isOff && row.id === "kick" && kickDown;
        const kbps = wobble(row.target, tick, i);
        const state = isOff ? "off" : down ? "down" : "live";

        return (
          <button
            key={row.id}
            type="button"
            onClick={() => toggle(row.id)}
            aria-pressed={!isOff}
            className={cn(
              ROW,
              "cursor-pointer outline-offset-2 transition-colors duration-150",
              "hover:bg-surface-3 focus-visible:outline-[3px] focus-visible:outline-brass",
              isOff && "opacity-70",
            )}
          >
            <PlatformGlyph id={row.id} />
            <div>
              <strong>{row.name}</strong>
              <small>
                {isOff
                  ? copy.paused
                  : down
                    ? fill(copy.reconnecting, { s: String(12 + kickPhase) })
                    : fill(copy.metrics, {
                        kbps: group(kbps, copy.sep),
                        drops: String(row.id === "kick" ? kickDrops : 0),
                      })}
              </small>
            </div>
            {/* Remount the status badge to replay its transition when the state changes. */}
            <motion.span
              key={state}
              initial={calm ? false : { scale: 0.72, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <State tone={down ? "warn" : isOff ? "quiet" : "ok"}>
                <i
                  className={cn(
                    down &&
                      !calm &&
                      "animate-[soft-pulse_1.2s_ease-in-out_infinite]",
                  )}
                />{" "}
                {down ? copy.back : isOff ? copy.pausedState : copy.onAir}
              </State>
            </motion.span>
          </button>
        );
      })}

      <div className="mt-[13px] flex flex-wrap gap-x-4 gap-y-2 border-t-2 border-border-soft pt-[13px]">
        <Meter label={copy.cpu} pct={cpu} calm={calm} />
        <Meter label={copy.gpu} pct={gpu} ok calm={calm} />
        <span className="flex items-center gap-[7px] text-[0.66rem] font-extrabold tracking-[0.04em] whitespace-nowrap text-muted uppercase tabular-nums [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:shrink-0 [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round] [&>svg]:[stroke-width:2.2]">
          <EyeIcon />
          {fill(copy.watching, { n: group(viewers, copy.sep) })}
        </span>
      </div>

      <p className="mt-2.5 text-[0.62rem] font-bold tracking-[0.04em] text-faint-raised">
        {copy.hint}
      </p>
    </div>
  );
}

const SAMPLES = [
  362, 430, 495, 560, 610, 680, 650, 740, 800, 880, 1284, 1160, 1130, 1040,
  1090, 980, 900, 940, 830, 760, 610,
];
const PEAK = 1284;
const LAST = SAMPLES.length - 1;
const W = 360;
const H = 96;
const START_MIN = 21 * 60;
const SPAN_MIN = 192;

const xAt = (i: number) => (i / LAST) * W;
const yOf = (v: number) => 90 - (v / PEAK) * 72;
const CURVE = SAMPLES.map(
  (v, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)},${yOf(v).toFixed(1)}`,
).join(" ");

function viewersAt(p: number) {
  const x = Math.max(0, Math.min(LAST, p * LAST));
  const i = Math.min(LAST - 1, Math.floor(x));
  return SAMPLES[i] + (SAMPLES[i + 1] - SAMPLES[i]) * (x - i);
}

function clockAt(p: number) {
  const total = Math.round(START_MIN + p * SPAN_MIN) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const RAID = 10 / LAST;
const DROP = 14 / LAST;
const NEAR = 0.035;

const GRID =
  "stroke-border-dry [stroke-width:1] [vector-effect:non-scaling-stroke]";

const SWEEP_MS = 18000;

export function ReportChart({ copy }: { copy: ReportChartCopy }) {
  // The first effect needs the actual motion preference; useCalm initially assumes reduced motion.
  const reduce = useReducedMotion() ?? false;
  const box = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(box);
  const [held, setHeld] = useState(false);

  // MotionValues update visuals per frame; React state tracks only discrete indicators and announcements.
  const pos = useMotionValue(0);

  useAnimationFrame((_, delta) => {
    if (!onScreen || held || reduce) return;
    // Clamp the first frame after backgrounding so the cursor cannot skip across the session.
    const next = pos.get() + Math.min(delta, 64) / SWEEP_MS;
    pos.set(next >= 1 ? 0 : next);
  });

  // Reduced motion must reveal the complete chart instead of leaving it dimmed at the start.
  useEffect(() => {
    if (reduce) pos.set(1);
  }, [reduce, pos]);

  const left = useTransform(pos, (p) => `${p * 100}%`);
  const dotTop = useTransform(pos, (p) => `${(yOf(viewersAt(p)) / H) * 100}%`);
  // A right-anchored scale transform reveals the chart without per-frame layout work.
  const veil = useTransform(pos, (p) => 1 - p);
  const readout = useTransform(
    pos,
    (p) =>
      `${clockAt(p)} · ${fill(copy.watching, {
        n: group(Math.round(viewersAt(p)), copy.sep),
      })}`,
  );

  const [mark, setMark] = useState({ min: 0, raid: false, drop: false });
  useMotionValueEvent(pos, "change", (p) => {
    const raid = Math.abs(p - RAID) < NEAR;
    const drop = Math.abs(p - DROP) < NEAR;
    const min = Math.round(p * SPAN_MIN);
    // Reuse the object when indicators are unchanged to avoid a React render.
    setMark((cur) =>
      cur.raid === raid && cur.drop === drop && Math.abs(cur.min - min) < 4
        ? cur
        : { min, raid, drop },
    );
  });

  const seek = (clientX: number) => {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    pos.set(Math.max(0, Math.min(1, (clientX - r.left) / r.width)));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step =
      e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowLeft"
          ? -1
          : e.key === "Home"
            ? -99
            : e.key === "End"
              ? 99
              : 0;
    if (!step) return;
    e.preventDefault();
    pos.set(Math.max(0, Math.min(1, pos.get() + step / LAST)));
  };

  const ariaP = mark.min / SPAN_MIN;

  return (
    <div ref={box} className={PANEL}>
      <DemoLabel>
        <span>{copy.label}</span>
        <span>{copy.tag}</span>
      </DemoLabel>

      {/* Reserve horizontal dragging for seeking while allowing vertical page scrolling. */}
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={copy.scrub}
        aria-valuemin={0}
        aria-valuemax={SPAN_MIN}
        aria-valuenow={mark.min}
        aria-valuetext={`${clockAt(ariaP)} · ${fill(copy.watching, {
          n: group(Math.round(viewersAt(ariaP)), copy.sep),
        })}`}
        onKeyDown={onKeyDown}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setHeld(true);
          seek(e.clientX);
        }}
        onPointerMove={(e) => seek(e.clientX)}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
        className="relative my-1.5 cursor-ew-resize touch-pan-y rounded-sm outline-offset-4 focus-visible:outline-[3px] focus-visible:outline-brass"
      >
        <svg
          className="block h-auto w-full"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={copy.chartAria}
        >
          <line className={GRID} x1="0" y1="24" x2={W} y2="24" />
          <line className={GRID} x1="0" y1="56" x2={W} y2="56" />
          <path className="fill-brass/20" d={`${CURVE} L${W},${H} L0,${H} Z`} />
          <path
            className="fill-none stroke-brass [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2.5] [vector-effect:non-scaling-stroke]"
            d={CURVE}
          />
        </svg>

        {/* Draw the veil before markers so they remain legible in the unread region. */}
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 origin-right bg-surface/65"
          style={{ scaleX: veil }}
        />

        {/* Keep dots in HTML; a stretched SVG viewBox would turn circles into ellipses. */}
        <Marker at={RAID} tone="brass" pos={pos} reduce={reduce} />
        <Marker at={DROP} tone="warn" pos={pos} reduce={reduce} />

        <motion.span
          className="pointer-events-none absolute inset-y-0 w-px bg-cream/70"
          style={{ left }}
          aria-hidden="true"
        >
          <i className="absolute -top-1 -left-[3.5px] size-[7px] rounded-full bg-cream" />
        </motion.span>
        <motion.span
          className="pointer-events-none absolute z-2 -mt-[6px] -ml-[6px] size-3 rounded-full border-2 border-surface bg-cream"
          style={{ left, top: dotTop }}
          aria-hidden="true"
        />
      </div>

      <div className="flex items-center justify-between gap-2 text-[0.6rem] font-bold tabular-nums text-faint-raised">
        <span>{clockAt(0)}</span>
        <motion.strong className="rounded-sm bg-surface-2 px-2 py-1 text-[0.66rem] font-extrabold text-cream">
          {readout}
        </motion.strong>
        <span>{clockAt(1)}</span>
      </div>

      <div className="mt-[13px] flex flex-wrap gap-[7px] [&>span]:text-[0.62rem]">
        <Chip tone="ok">{copy.peak}</Chip>
        <Chip quiet>{copy.average}</Chip>
        <Chip quiet>{copy.messages}</Chip>
        <motion.span
          animate={{ scale: mark.raid ? 1.07 : 1 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          className="origin-left"
        >
          <Chip className={cn(!mark.raid && "opacity-55")}>{copy.raid}</Chip>
        </motion.span>
        <motion.span
          animate={{ scale: mark.drop ? 1.07 : 1 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          className="origin-left"
        >
          <Chip tone="warn" className={cn(!mark.drop && "opacity-55")}>
            {copy.drop}
          </Chip>
        </motion.span>
      </div>

      <p className="mt-2.5 text-[0.62rem] font-bold tracking-[0.04em] text-faint-raised">
        {copy.hint}
      </p>
    </div>
  );
}

function Marker({
  at,
  tone,
  pos,
  reduce,
}: {
  at: number;
  tone: "brass" | "warn";
  pos: MotionValue<number>;
  reduce: boolean;
}) {
  // Widen the result to number so useSpring accepts the MotionValue rather than a literal union.
  const target = useTransform(pos, (p): number =>
    Math.abs(p - at) < NEAR ? 1.55 : 1,
  );
  const scale = useSpring(target, { stiffness: 320, damping: 26 });
  return (
    <motion.span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-2 -mt-[5px] -ml-[5px] size-2.5 rounded-full border-2 border-surface",
        tone === "warn" ? "bg-warn" : "bg-brass",
      )}
      style={{
        left: `${at * 100}%`,
        top: `${(yOf(viewersAt(at)) / H) * 100}%`,
        scale: reduce ? target : scale,
      }}
    />
  );
}
