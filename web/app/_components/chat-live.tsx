"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mascot, PlatformGlyph } from "./decor";
import { CoinIcon, HeartIcon, RaidIcon, StarIcon } from "./icons";
import { cn } from "./ui";
import { useCalm, useHeartbeat } from "./use-motion";

type PlatId = "twitch" | "youtube" | "kick";

export interface ChatMsg {
  name: string;
  text: string;
  platform: PlatId;
  badge?: string;
  badgeTone?: "mod" | "member";
}

export interface ChatFeedCopy {
  label: string;
  example: string;
  pool: ChatMsg[];
  actionDelete: string;
  actionTimeout: string;
  actionReply: string;
  removed: string;
  timedOut: string;
  input: string;
  sendAll: string;
  hint: string;
  me: string;
  mineBadge: string;
}

/** Rows must not shrink to fit; the viewport clips older messages instead. */
const MSG =
  "group relative grid shrink-0 grid-cols-[26px_minmax(0,1fr)] gap-[9px] rounded-md bg-surface px-2.5 py-[9px] " +
  "[&_.glyph]:h-[26px] [&_.glyph]:w-[26px]";
const MSG_HEAD =
  "flex items-center gap-1.5 [&>strong]:text-[0.74rem] [&>strong]:font-extrabold";
// Raised surfaces need a lighter muted token to maintain text contrast.
const MSG_TIME =
  "ml-auto text-[0.56rem] font-bold tabular-nums text-faint-raised transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0";
const BADGE =
  "rounded-sm px-[5px] py-px text-[0.5rem] font-extrabold tracking-[0.04em] uppercase";
const ACTION =
  "cursor-pointer rounded-sm border border-border-dry bg-surface-2 px-[7px] py-[3px] text-[0.56rem] font-extrabold tracking-[0.04em] text-muted uppercase " +
  "outline-offset-2 transition-colors duration-120 hover:border-brass hover:text-cream focus-visible:outline-2 focus-visible:outline-brass " +
  "[@media(pointer:coarse)]:px-2.5 [@media(pointer:coarse)]:py-1.5";

const ARRIVAL_MS = 2600;
// Retain enough rows to clip older messages below the visible viewport.
const KEEP = 10;
const TOMB_MS = 1400;

type Status = "live" | "gone" | "muted";
interface Line {
  key: number;
  idx: number;
  status: Status;
  mine?: string;
}

const at = (key: number) => {
  const s = 21 * 3600 + 42 * 60 + key * 7;
  return `${String(Math.floor(s / 3600) % 24).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}`;
};

export function ChatFeed({ copy }: { copy: ChatFeedCopy }) {
  const calm = useCalm();
  const box = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>(() =>
    Array.from({ length: 5 }, (_, i) => ({ key: i, idx: i, status: "live" })),
  );
  const [draft, setDraft] = useState("");

  useHeartbeat(box, ARRIVAL_MS, !calm, () =>
    setLines((cur) => {
      const key = (cur[cur.length - 1]?.key ?? -1) + 1;
      const next = [
        ...cur,
        { key, idx: key % copy.pool.length, status: "live" as Status },
      ];
      return next.length > KEEP ? next.slice(next.length - KEEP) : next;
    }),
  );

  const setStatus = (key: number, status: Status) =>
    setLines((cur) => cur.map((l) => (l.key === key ? { ...l, status } : l)));

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setLines((cur) => {
      const key = (cur[cur.length - 1]?.key ?? -1) + 1;
      const next = [
        ...cur,
        { key, idx: 0, status: "live" as Status, mine: text },
      ];
      return next.length > KEEP ? next.slice(next.length - KEEP) : next;
    });
    setDraft("");
  };

  const remove = (key: number) => {
    setStatus(key, "gone");
    setTimeout(
      () => setLines((cur) => cur.filter((l) => l.key !== key)),
      TOMB_MS,
    );
  };

  const shown = lines;

  return (
    <div ref={box}>
      <div className="mb-[15px] flex items-center justify-between gap-2.5 text-[0.64rem] font-extrabold tracking-[0.12em] text-faint-raised uppercase">
        <span>{copy.label}</span>
        <span>{copy.example}</span>
      </div>

      {/* Keep the viewport height fixed and messages bottom-aligned to prevent section growth. */}
      <div className="flex h-[292px] flex-col justify-end gap-[7px] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_34px)] max-[760px]:h-[248px]">
        <AnimatePresence initial={false}>
          {shown.map((line, i) => {
            const msg = copy.pool[line.idx];
            const dead = line.status === "gone";
            const muted = line.status === "muted";
            return (
              <motion.div
                key={line.key}
                layout={!calm}
                initial={calm ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -14, transition: { duration: 0.2 } }}
                transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
                className={cn(MSG, (dead || muted) && "opacity-80")}
              >
                {line.mine ? (
                  <span className="grid size-[26px] place-items-center rounded-sm bg-brass text-brass-ink shadow-pop-sm [&>svg]:h-[62%] [&>svg]:w-[62%]">
                    <Mascot />
                  </span>
                ) : (
                  <PlatformGlyph id={msg.platform} />
                )}
                <div className="min-w-0">
                  <div className={MSG_HEAD}>
                    <strong>{line.mine ? copy.me : msg.name}</strong>
                    {line.mine ? (
                      <span className={cn(BADGE, "bg-brass text-brass-ink")}>
                        {copy.mineBadge}
                      </span>
                    ) : (
                      msg.badge && (
                        <span
                          className={cn(
                            BADGE,
                            msg.badgeTone === "member"
                              ? "bg-brass text-brass-ink"
                              : "bg-ok text-night",
                          )}
                        >
                          {msg.badge}
                        </span>
                      )
                    )}
                    {(dead || muted) && (
                      <span
                        className={cn(BADGE, "bg-surface-3 text-faint-raised")}
                      >
                        {dead ? copy.removed : copy.timedOut}
                      </span>
                    )}
                    <span className={MSG_TIME}>{at(line.key)}</span>
                  </div>

                  <p
                    className={cn(
                      "relative mt-[3px] w-fit text-[0.8rem] leading-[1.4] font-[550] transition-colors duration-400",
                      dead || muted ? "text-faint-raised" : "text-cream",
                    )}
                  >
                    {line.mine ?? msg.text}
                    {/* Keep the strike mounted: AnimatePresence initial={false} suppresses descendant entry animations. */}
                    <motion.i
                      aria-hidden="true"
                      className="absolute top-1/2 left-0 block h-px w-full origin-left bg-current"
                      initial={false}
                      animate={{ scaleX: dead ? 1 : 0 }}
                      transition={{
                        duration: calm ? 0 : 0.42,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    />
                  </p>
                </div>

                {/* Disable pointer events while actions are hidden so invisible controls cannot capture clicks. */}
                {!line.mine && (
                  <div
                    className={cn(
                      "absolute top-[7px] right-2.5 flex gap-1 rounded-sm opacity-0 transition-opacity duration-150",
                      "pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100",
                      "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
                      /* Touch devices lack hover; expose actions on the newest message. */
                      i === shown.length - 1
                        ? "[@media(pointer:coarse)]:pointer-events-auto [@media(pointer:coarse)]:opacity-100"
                        : "[@media(pointer:coarse)]:opacity-0",
                    )}
                  >
                    <button
                      type="button"
                      className={ACTION}
                      onClick={() => remove(line.key)}
                      disabled={dead}
                    >
                      {copy.actionDelete}
                    </button>
                    <button
                      type="button"
                      className={cn(ACTION, "max-[520px]:hidden")}
                      onClick={() => setStatus(line.key, "muted")}
                      disabled={dead || muted}
                    >
                      {copy.actionTimeout}
                    </button>
                    <button
                      type="button"
                      className={cn(ACTION, "max-[520px]:hidden")}
                      onClick={() => setDraft(`@${msg.name} `)}
                    >
                      {copy.actionReply}
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <form
        onSubmit={send}
        className="mt-[7px] flex min-h-[38px] items-center gap-1.5 rounded-md border-2 border-border-dry pl-[11px] focus-within:border-brass"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={copy.input}
          aria-label={copy.input}
          className="min-w-0 flex-1 bg-transparent py-2 text-[0.74rem] font-semibold text-cream outline-none placeholder:text-faint-raised"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className={cn(
            "my-0.5 mr-0.5 cursor-pointer rounded-sm px-2.5 py-1.5 text-[0.74rem] font-extrabold whitespace-nowrap text-brass",
            "outline-offset-2 transition-colors duration-150 hover:bg-brass hover:text-brass-ink focus-visible:outline-2 focus-visible:outline-brass",
            "disabled:cursor-default disabled:text-faint-raised disabled:hover:bg-transparent disabled:hover:text-faint-raised",
            "[@media(pointer:coarse)]:min-h-9",
          )}
        >
          {copy.sendAll}
        </button>
      </form>

      <p className="mt-2.5 text-[0.62rem] font-bold tracking-[0.04em] text-faint-raised">
        {copy.hint}
      </p>
    </div>
  );
}

export type AlertKind =
  "follow" | "sub" | "raid" | "superchat" | "bits" | "member";

export interface AlertItem {
  kind: AlertKind;
  title: string;
  meta: string;
  amount?: string;
}

export interface AlertsFeedCopy {
  label: string;
  example: string;
  pool: AlertItem[];
  test: string;
}

const ICON: Record<AlertKind, React.ReactNode> = {
  follow: <HeartIcon />,
  sub: <StarIcon />,
  raid: <RaidIcon />,
  superchat: <CoinIcon />,
  bits: <CoinIcon />,
  member: <StarIcon />,
};
const KIND_TONE: Record<AlertKind, string> = {
  follow: "bg-ok text-night",
  sub: "bg-brass text-brass-ink",
  raid: "bg-tomato text-white",
  superchat: "bg-brass text-brass-ink",
  bits: "bg-ok text-night",
  member: "bg-tomato text-white",
};

const ALERT_MS = 3400;
const ALERTS_KEEP = 4;

export function AlertsFeed({ copy }: { copy: AlertsFeedCopy }) {
  const calm = useCalm();
  const box = useRef<HTMLDivElement>(null);
  const [keys, setKeys] = useState<number[]>([3, 2, 1, 0]);

  const push = () =>
    setKeys((cur) => [(cur[0] ?? -1) + 1, ...cur].slice(0, ALERTS_KEEP));

  useHeartbeat(box, ALERT_MS, !calm, push);

  return (
    <div ref={box}>
      <div className="mb-[15px] flex items-center justify-between gap-2.5 text-[0.64rem] font-extrabold tracking-[0.12em] text-faint-raised uppercase">
        <span>{copy.label}</span>
        <span>{copy.example}</span>
      </div>

      <div className="flex h-[268px] flex-col gap-[7px] overflow-hidden max-[760px]:h-[248px]">
        <AnimatePresence initial={false}>
          {keys.map((key) => {
            const item = copy.pool[key % copy.pool.length];
            return (
              <motion.div
                key={key}
                layout={!calm}
                initial={calm ? false : { opacity: 0, y: -12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.18 } }}
                transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
                className={
                  "grid shrink-0 grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md bg-surface px-[11px] py-2.5 " +
                  "[&>div>strong]:block [&>div>strong]:text-[0.8rem] [&>div>strong]:font-extrabold " +
                  "[&>div>small]:mt-0.5 [&>div>small]:block [&>div>small]:text-[0.68rem] [&>div>small]:font-[550] [&>div>small]:text-muted"
                }
              >
                <span
                  className={cn(
                    "grid size-[30px] place-items-center rounded-sm text-[0.62rem] font-extrabold [&>svg]:h-4 [&>svg]:w-4 [&>svg]:fill-none [&>svg]:stroke-current",
                    KIND_TONE[item.kind],
                  )}
                >
                  {ICON[item.kind]}
                </span>
                <div className="min-w-0">
                  <strong>{item.title}</strong>
                  <small>{item.meta}</small>
                </div>
                {item.amount && (
                  <span className="font-display text-[0.94rem] font-extrabold tabular-nums">
                    {item.amount}
                  </span>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={push}
        className={cn(
          "mt-3 flex min-h-[38px] w-full cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-border-dry",
          "text-[0.68rem] font-extrabold tracking-[0.06em] text-brass uppercase",
          "outline-offset-2 transition-colors duration-150 hover:border-brass hover:bg-surface-2 focus-visible:outline-[3px] focus-visible:outline-brass",
        )}
      >
        {copy.test}
      </button>
    </div>
  );
}

export interface OverlayCopy {
  label: string;
  example: string;
  scene: string;
  alert: string;
  camera: string;
  chat: string[];
  copy: string;
  copied: string;
  urls: string[];
}

const ALERT_ON = 3600;
const ALERT_OFF = 2400;

export function OverlayScene({ copy }: { copy: OverlayCopy }) {
  const calm = useCalm();
  const box = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useHeartbeat(box, on ? ALERT_ON : ALERT_OFF, !calm, () => setOn((v) => !v));

  const copyUrl = (url: string) => {
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(url);
        setTimeout(() => setCopied((cur) => (cur === url ? null : cur)), 1800);
      })
      // Never claim a successful copy when the clipboard rejects it.
      .catch(() => {});
  };

  return (
    <div ref={box}>
      <div className="mb-[15px] flex items-center justify-between gap-2.5 text-[0.64rem] font-extrabold tracking-[0.12em] text-faint-raised uppercase">
        <span>{copy.label}</span>
        <span>{copy.example}</span>
      </div>

      <div className="relative grid aspect-video content-start overflow-hidden rounded-lg border-2 border-border-dry bg-surface bg-[image:var(--halftone-dark)] bg-[length:16px_16px] p-3">
        <small className="text-[0.6rem] font-extrabold tracking-[0.1em] text-faint-raised uppercase">
          {copy.scene}
        </small>

        {/* Reserve alert space to avoid layout shifts as the demonstration loops. */}
        <div className="mt-3.5 flex h-[42px] items-center justify-center">
          <AnimatePresence>
            {on && (
              <motion.div
                initial={
                  calm ? false : { opacity: 0, y: -14, scale: 0.9, rotate: -6 }
                }
                animate={{ opacity: 1, y: 0, scale: 1, rotate: -1.4 }}
                exit={{
                  opacity: 0,
                  scale: 0.94,
                  transition: { duration: 0.22 },
                }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
                className="flex w-max max-w-full items-center gap-[9px] rounded-md bg-brass px-[13px] py-[9px] font-display text-[0.9rem] font-extrabold text-brass-ink shadow-pop [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:fill-none [&>svg]:stroke-current"
              >
                <StarIcon />
                {copy.alert}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <span
          className="absolute right-3 bottom-3 grid aspect-4/3 w-[27%] content-end justify-end rounded-md border-2 border-dashed border-border-dry px-[9px] py-[7px] text-[0.58rem] font-extrabold tracking-[0.08em] text-faint-raised uppercase"
          aria-hidden="true"
        >
          {copy.camera}
        </span>

        <div
          className="absolute bottom-3 left-3 flex flex-col gap-[5px] [&>span]:flex [&>span]:w-max [&>span]:max-w-full [&>span]:items-center [&>span]:gap-1.5 [&>span]:rounded-sm [&>span]:bg-night/[0.78] [&>span]:px-2 [&>span]:py-[5px] [&>span]:text-[0.66rem] [&>span]:font-[650] [&_i]:h-[7px] [&_i]:w-[7px] [&_i]:shrink-0 [&_i]:rounded-full"
          aria-hidden="true"
        >
          {copy.chat.map((line, i) => (
            <span key={line}>
              <i
                style={{
                  background: [
                    "var(--twitch)",
                    "var(--youtube)",
                    "var(--kick)",
                  ][i],
                }}
              />{" "}
              {line}
            </span>
          ))}
        </div>
      </div>

      {copy.urls.map((url) => (
        <button
          key={url}
          type="button"
          onClick={() => copyUrl(url)}
          className={cn(
            "mt-2 flex min-h-[38px] w-full cursor-pointer items-center justify-between gap-2.5 rounded-md border-2 border-border-dry px-[11px] text-left",
            "outline-offset-2 transition-colors duration-150 hover:border-brass focus-visible:outline-[3px] focus-visible:outline-brass",
          )}
        >
          <code className="truncate text-[0.72rem] font-semibold text-muted">
            {url}
          </code>
          <span
            className={cn(
              "text-[0.62rem] font-extrabold tracking-[0.06em] uppercase",
              copied === url ? "text-ok" : "text-brass",
            )}
          >
            {copied === url ? copy.copied : copy.copy}
          </span>
        </button>
      ))}
    </div>
  );
}
