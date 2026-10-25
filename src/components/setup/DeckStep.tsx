import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import {
  Activity,
  BellRing,
  Check,
  Clapperboard,
  Eye,
  LayoutGrid,
  MapPin,
  MessagesSquare,
  Mic,
  Pause,
  QrCode,
  RefreshCw,
  Smartphone,
  Square,
} from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { SETUP_PLATFORMS } from "../../lib/platforms";
import { useStore } from "../../lib/store";
import { cn } from "../../lib/utils";
import { QrSvg, useDeckStatus, usePairTicket } from "../deck/pairing";
import { Button, PlatformGlyph } from "../ui";
import { StepHeader } from "./steps";

// The phone page is always dark, so the preview keeps the dark palette under the light theme too.
const PHONE_PALETTE = {
  "--color-bg": "#100b07",
  "--color-surface": "#1a130c",
  "--color-surface-2": "#221a10",
  "--color-surface-3": "#2e2314",
  "--color-border": "#3d301c",
  "--color-ink": "#fcf3e3",
  "--color-ink-muted": "#c6b69b",
  "--color-ink-faint": "#9e8c70",
  "--color-brass": "#ffb323",
  "--color-brass-ink": "#2a1c00",
  "--color-live": "#ff4733",
  "--color-ok": "#56e39b",
  "--color-bad": "#ff5e57",
  "--color-night": "#0b0805",
} as CSSProperties;

/** Beats of the preview loop: tap Mark, read the toast, turn BE RIGHT BACK on and off again. */
const LOOP = 8;

function TapRing() {
  return (
    <m.span
      aria-hidden
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 1.4, opacity: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="pointer-events-none absolute left-1/2 top-1/2 -ml-5 -mt-5 size-10 rounded-full border-[3px] border-brass bg-brass/30"
    />
  );
}

function MiniKey({
  icon: Icon,
  label,
  tone,
  tapped,
}: {
  icon: typeof Mic;
  label: string;
  tone?: "on" | "danger";
  tapped: boolean;
}) {
  return (
    <m.div
      animate={{ scale: tapped ? 0.95 : 1 }}
      transition={{ duration: 0.12 }}
      className={cn(
        "relative flex h-[70px] flex-col justify-between rounded-lg p-2.5 transition-colors duration-200",
        tone === "on"
          ? "bg-brass text-brass-ink shadow-[3px_3px_0_0_var(--color-brass-ink)]"
          : tone === "danger"
            ? "bg-bad/12 text-bad shadow-[inset_0_0_0_2px_rgba(255,94,87,.42)]"
            : "bg-surface-2 text-ink",
      )}
    >
      <Icon
        className={cn(
          "size-4",
          tone === "on"
            ? "text-brass-ink"
            : tone === "danger"
              ? "text-bad"
              : "text-brass",
        )}
      />
      <span className="font-display text-[13px] font-extrabold leading-none">
        {label}
      </span>
      <AnimatePresence>{tapped && <TapRing />}</AnimatePresence>
    </m.div>
  );
}

/** A small, living copy of the phone deck, so the step shows what it offers. */
function DeckPreview({ paired }: { paired: boolean }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const timer = setInterval(() => setBeat((b) => (b + 1) % LOOP), 1300);
    return () => clearInterval(timer);
  }, [reduce]);
  const tap = beat === 1 ? "mark" : beat === 4 || beat === 6 ? "brb" : null;
  const brb = beat === 4 || beat === 5;
  const toast = reduce
    ? "mark"
    : beat >= 1 && beat <= 3
      ? "mark"
      : brb
        ? "brb"
        : null;

  return (
    <div className="relative w-[236px] shrink-0 pl-5 pt-3">
      <m.div
        aria-hidden
        initial={{ opacity: 0, rotate: 0, x: 10 }}
        animate={{ opacity: 1, rotate: -9, x: 0 }}
        transition={{
          delay: 0.35,
          type: "spring",
          stiffness: 220,
          damping: 18,
        }}
        className="absolute left-0 top-10 z-0 w-[86px] rounded-md bg-white p-1.5 pop"
      >
        <QrSvg text="https://corneta.live/deck" label="" />
      </m.div>
      <m.div
        role="img"
        aria-label={t("components.setup.deck.preview")}
        initial={{ opacity: 0, y: 14, rotate: 0 }}
        animate={{ opacity: 1, y: 0, rotate: 2 }}
        transition={{ type: "spring", stiffness: 240, damping: 20 }}
        style={PHONE_PALETTE}
        className="relative z-10 ml-6 w-[206px] rounded-[30px] border-2 border-surface-3 bg-[#060403] p-[7px] shadow-[8px_8px_0_0_var(--color-night)]"
      >
        <div className="relative flex h-[392px] flex-col overflow-hidden rounded-[23px] bg-bg text-ink">
          <div className="flex items-center gap-2 px-3 pb-2 pt-3">
            <span
              className={cn(
                "flex -rotate-2 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 font-display text-[10px] font-extrabold leading-none shadow-[2px_2px_0_0_var(--color-night)] transition-colors duration-200",
                brb ? "bg-brass text-brass-ink" : "bg-live text-white",
              )}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {brb ? t("deck.head.brb") : t("deck.head.live")}
              <span className="tabular-nums">01:12:44</span>
            </span>
            <span className="ml-auto flex items-center gap-1 text-ink-faint">
              <Eye className="size-3" />
              <b className="font-display text-xs font-extrabold text-ink">
                1.284
              </b>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 px-3 pb-2">
            {SETUP_PLATFORMS.slice(0, 3).map((id) => (
              <span
                key={id}
                className="flex items-center justify-between rounded-md bg-surface px-1.5 py-1"
              >
                <PlatformGlyph id={id} size={16} />
                <span
                  className={cn(
                    "size-1.5 rounded-full transition-colors duration-200",
                    brb ? "bg-brass" : "bg-ok",
                  )}
                />
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-2 px-3">
            <m.div
              animate={{ scale: tap === "mark" ? 0.97 : 1 }}
              transition={{ duration: 0.12 }}
              className="relative flex h-[78px] items-center gap-2.5 rounded-lg bg-brass px-3 text-brass-ink shadow-[3px_3px_0_0_var(--color-brass-ink)]"
            >
              <MapPin className="size-6 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[15px] font-extrabold leading-[0.95]">
                  {t("deck.key.mark")}
                </span>
                <span className="mt-1 block truncate text-[9px] font-semibold opacity-75">
                  {t("deck.key.mark.last", { at: "00:41:10" })}
                </span>
              </span>
              <AnimatePresence>{tap === "mark" && <TapRing />}</AnimatePresence>
            </m.div>
            <div className="grid grid-cols-2 gap-2">
              <MiniKey
                icon={Pause}
                label={t("deck.key.brb")}
                tone={brb ? "on" : undefined}
                tapped={tap === "brb"}
              />
              <MiniKey icon={Mic} label={t("deck.key.mic")} tapped={false} />
              <MiniKey
                icon={Clapperboard}
                label={t("deck.key.scene")}
                tapped={false}
              />
              <MiniKey
                icon={Square}
                label={t("deck.key.stop")}
                tone="danger"
                tapped={false}
              />
            </div>
          </div>
          <AnimatePresence>
            {toast && (
              <m.div
                key={toast}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  "absolute inset-x-2.5 bottom-[54px] flex items-center gap-1.5 rounded-md border-l-[3px] bg-surface-2 px-2 py-1.5 text-[10px] font-semibold leading-tight shadow-[3px_3px_0_0_var(--color-night)]",
                  toast === "mark" ? "border-ok" : "border-brass",
                )}
              >
                <Check
                  className={cn(
                    "size-3 shrink-0",
                    toast === "mark" ? "text-ok" : "text-brass",
                  )}
                  strokeWidth={3}
                />
                {toast === "mark"
                  ? t("components.setup.deck.previewMarked")
                  : t("components.setup.deck.previewBrb")}
              </m.div>
            )}
          </AnimatePresence>
          <div className="mt-auto grid grid-cols-3 gap-1.5 border-t border-surface-2 bg-night px-2.5 pb-3 pt-1.5">
            {[
              { Icon: LayoutGrid, label: t("deck.tabs.deck"), on: true },
              { Icon: MessagesSquare, label: t("deck.tabs.chat") },
              { Icon: Activity, label: t("deck.tabs.health") },
            ].map(({ Icon, label, on }) => (
              <span
                key={label}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-md py-1 font-display text-[9px] font-bold leading-none",
                  on ? "bg-brass text-brass-ink" : "text-ink-faint",
                )}
              >
                <Icon className="size-3" />
                {label}
              </span>
            ))}
          </div>
        </div>
        <AnimatePresence>
          {paired && (
            <m.span
              initial={{ scale: 0, rotate: -40 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 480, damping: 16 }}
              className="absolute -right-3 -top-3 grid size-10 place-items-center rounded-full bg-ok text-night shadow-[3px_3px_0_0_var(--color-night)]"
            >
              <Check className="size-5" strokeWidth={3.2} />
            </m.span>
          )}
        </AnimatePresence>
      </m.div>
    </div>
  );
}

function FlowChips({ vertical = false }: { vertical?: boolean }) {
  const { t } = useI18n();
  const steps = [
    t("components.setup.deck.flow.scan"),
    t("components.setup.deck.flow.code"),
    t("components.setup.deck.flow.allow"),
  ];
  return (
    <ol
      className={cn(
        "flex text-xs font-bold text-ink-muted",
        vertical
          ? "flex-col gap-2"
          : "flex-wrap items-center gap-x-1.5 gap-y-2",
      )}
    >
      {steps.map((label, i) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className="grid size-5 place-items-center rounded-full bg-surface-3 font-display text-[11px] font-extrabold text-brass">
            {i + 1}
          </span>
          {label}
          {!vertical && i < steps.length - 1 && (
            <span aria-hidden className="text-ink-faint">
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * Optional bonus step: introduces the phone deck and pairs a phone on the spot. Deck mode stays off
 * unless the streamer turns it on here, and goes back off if they leave without pairing.
 */
export function DeckStep({
  titleRef,
}: {
  titleRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const { t } = useI18n();
  const enabled = useStore((s) => s.config!.settings.deckEnabled);
  const setSettings = useStore((s) => s.setSettings);
  const status = useDeckStatus();
  const [pairing, setPairing] = useState(false);
  const [asked, setAsked] = useState(false);
  const [known, setKnown] = useState<Set<string> | null>(null);
  const turnedOnHere = useRef(false);

  useEffect(() => {
    if (status && known === null)
      setKnown(new Set(status.devices.map((d) => d.id)));
  }, [status, known]);
  useEffect(
    () =>
      api.subscribeDeck({
        pairRequest: () => setAsked(true),
        pairClosed: () => setAsked(false),
      }),
    [],
  );

  const devices = status?.devices ?? [];
  const fresh = known ? devices.find((d) => !known.has(d.id)) : undefined;
  const ready = !!status?.running && !!status.address;
  const pair = usePairTicket(pairing && ready && !fresh);

  // Leaving the step without a paired phone undoes the switch this step flipped.
  const keepOn = useRef(false);
  keepOn.current = devices.length > 0;
  useEffect(
    () => () => {
      if (turnedOnHere.current && !keepOn.current)
        useStore.getState().setSettings({ deckEnabled: false });
    },
    [],
  );

  const start = () => {
    if (!enabled) {
      turnedOnHere.current = true;
      setSettings({ deckEnabled: true });
    }
    if (fresh) setKnown(new Set(devices.map((d) => d.id)));
    setPairing(true);
  };
  const cancel = () => {
    setPairing(false);
    setAsked(false);
    if (turnedOnHere.current && devices.length === 0) {
      turnedOnHere.current = false;
      setSettings({ deckEnabled: false });
    }
  };

  const statusLine = !status?.running
    ? t("components.setup.deck.starting")
    : status.error
      ? status.error
      : !status.address
        ? t("settings.deck.status.noNetwork")
        : asked
          ? t("components.setup.deck.asked")
          : pair.error
            ? pair.error
            : pair.expired
              ? t("settings.deck.pair.expired")
              : pair.ticket
                ? t("settings.deck.pair.expires", { time: pair.clock })
                : t("settings.deck.pair.loading");

  const features = [
    {
      Icon: Smartphone,
      title: t("components.setup.deck.keys.title"),
      body: t("components.setup.deck.keys.body"),
    },
    {
      Icon: BellRing,
      title: t("components.setup.deck.alerts.title"),
      body: t("components.setup.deck.alerts.body"),
    },
    {
      Icon: MessagesSquare,
      title: t("components.setup.deck.watch.title"),
      body: t("components.setup.deck.watch.body"),
    },
  ];

  return (
    <div>
      <StepHeader
        kicker={t("components.setup.deck.kicker")}
        title={t("components.setup.deck.title")}
        lead={t("components.setup.deck.lead")}
        titleRef={titleRef}
      />
      <div className="flex items-start gap-7">
        <DeckPreview paired={!!fresh} />
        <div className="min-w-0 flex-1 pt-2">
          <AnimatePresence mode="wait" initial={false}>
            {fresh ? (
              <m.div
                key="paired"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="rounded-lg border-2 border-ok/60 bg-surface p-5"
                aria-live="polite"
              >
                <span className="grid size-12 -rotate-6 place-items-center rounded-lg bg-ok text-night pop">
                  <Check className="size-7" strokeWidth={3.2} />
                </span>
                <h3 className="mt-4 text-2xl leading-tight">
                  {t("components.setup.deck.paired.title", {
                    name: fresh.name,
                  })}
                </h3>
                <p className="mt-2 text-sm text-ink-muted">
                  {t("components.setup.deck.paired.body")}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 -ml-2"
                  onClick={start}
                >
                  <QrCode className="size-4" />
                  {t("components.setup.deck.paired.more")}
                </Button>
              </m.div>
            ) : pairing ? (
              <m.div
                key="pairing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="rounded-lg border-2 border-border bg-surface p-5 pop"
              >
                <div className="flex items-start gap-5">
                  <div
                    className={cn(
                      "size-40 shrink-0 overflow-hidden rounded-md bg-white p-2 pop transition-opacity",
                      (pair.expired || !pair.ticket) && "opacity-30",
                    )}
                  >
                    {pair.ticket ? (
                      <QrSvg
                        text={pair.ticket.url}
                        label={t("settings.deck.pair.qrAlt")}
                      />
                    ) : (
                      <div className="size-full animate-pulse bg-surface-3" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg leading-tight">
                      {t("components.setup.deck.scan")}
                    </h3>
                    <div className="mt-3">
                      <FlowChips vertical />
                    </div>
                    <p
                      className={cn(
                        "mt-3 text-sm",
                        status?.error || pair.error
                          ? "font-semibold text-bad"
                          : asked
                            ? "font-semibold text-brass-text"
                            : "text-ink-muted",
                      )}
                      aria-live="polite"
                    >
                      {statusLine}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(pair.expired || pair.error) && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={pair.issue}
                      data-on-brass
                    >
                      <RefreshCw className="size-4" />
                      {t("settings.deck.pair.renew")}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={cancel}>
                    {t("components.setup.deck.notNow")}
                  </Button>
                </div>
              </m.div>
            ) : (
              <m.div
                key="intro"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <ul className="space-y-3.5">
                  {features.map(({ Icon, title, body }, i) => (
                    <m.li
                      key={title}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + i * 0.08 }}
                      className="flex items-start gap-3"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-brass">
                        <Icon className="size-[18px]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-display text-base font-bold leading-tight">
                          {title}
                        </span>
                        <span className="mt-0.5 block text-sm leading-snug text-ink-muted">
                          {body}
                        </span>
                      </span>
                    </m.li>
                  ))}
                </ul>
                <m.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="mt-5 rounded-lg bg-surface p-4"
                >
                  <FlowChips />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button variant="primary" onClick={start} data-on-brass>
                      <QrCode className="size-4" />
                      {devices.length > 0
                        ? t("components.setup.deck.paired.more")
                        : t("components.setup.deck.cta")}
                    </Button>
                    {devices.length > 0 && (
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-ok">
                        <Check className="size-4" strokeWidth={3} />
                        {devices.map((d) => d.name).join(", ")}
                      </span>
                    )}
                  </div>
                  <p className="mt-2.5 text-xs text-ink-faint">
                    {t("components.setup.deck.note")}
                  </p>
                </m.div>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
