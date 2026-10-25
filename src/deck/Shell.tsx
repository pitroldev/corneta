import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, MessageSquareReply, RotateCcw } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { ALERT_KIND_META, alertDetail } from "../lib/alertText";
import { markFeedback } from "../lib/markMoment";
import type { AlertKind, DeckCombo, PlatformMark } from "../lib/types";
import type { Link } from "./client";
import { EditGrid, Grid, Ready } from "./Board";
import { Chat, Composer, Health, type Draft } from "./Feed";
import { pausePlatform, platformPaused, type KeyContext } from "./keys";
import {
  ALERT_TIME_MS,
  DEFAULT_LAYOUT,
  MAX_COMBOS,
  MAX_KEYS,
  findCombo,
  alertWanted,
  effectiveLayout,
  isAction,
  swap,
  viewport,
  type DeckAlert,
  type DeckChat,
  type DeckState,
} from "./model";
import {
  ALERT_ICONS,
  Alerts,
  Head,
  Plats,
  Tabs,
  chipName,
  type Banner,
  type Tab,
} from "./parts";
import { ComboEditor, CombosSheet } from "./Combos";
import { PrefsSheet } from "./PrefsSheet";
import { Summary } from "./screens";
import {
  CatalogSheet,
  HowSheet,
  LabelsSheet,
  MenuSheet,
  SaySheet,
  SceneSheet,
  TargetSheet,
  TitleSheet,
  type SheetKind,
} from "./sheets";
import { useDeckPrefs } from "./prefs";
import { buzz, platformLabel, Toasts, useToasts, type ToastKind } from "./ui";

export type DeckEvent = { seq: number } & (
  { alert: DeckAlert } | { mention: DeckChat }
);

export interface Conn {
  state: DeckState;
  /** Phone clock when the state arrived. */
  receivedAt: number;
  chat: DeckChat[];
  /** Live chat lines received so far, for the unread badge. */
  chatSeq: number;
  link: Link;
  event: DeckEvent | null;
  command: (
    action: string,
    args?: Record<string, unknown>,
    timeoutMs?: number,
  ) => Promise<unknown>;
  reconnect: () => void;
  forget: () => void;
}

/** Phone or tablet by the screen itself, so a bigger interface keeps the same arrangement. */
function useViewport() {
  const [size, setSize] = useState(() =>
    viewport(window.innerWidth, window.innerHeight),
  );
  useEffect(() => {
    const onResize = () =>
      setSize((prev) => {
        const next = viewport(window.innerWidth, window.innerHeight);
        return next.form === prev.form && next.orient === prev.orient
          ? prev
          : next;
      });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

const SUMMARY_SEEN = "corneta.deck.summarySeen";

function summarySeen(): number | null {
  try {
    const value = window.sessionStorage.getItem(SUMMARY_SEEN);
    return value ? Number(value) : null;
  } catch {
    return null;
  }
}

/** Results of a title change: one entry per signed-in platform. */
type TitleResults = Record<
  string,
  { ok: boolean; warn?: string; error?: string }
>;

export function Shell({
  conn,
  deviceName,
}: {
  conn: Conn;
  deviceName: string;
}) {
  const { t, tp, locale } = useI18n();
  const { state, command } = conn;
  const [prefs, setPrefs] = useDeckPrefs();
  const { form, orient } = useViewport();
  const toasts = useToasts();
  const toast = toasts.push;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  /** Confirmations of what the phone just did, which the streamer may turn off. */
  const confirm = useCallback(
    (kind: "marks" | "actions", tone: ToastKind, text: string) => {
      if (prefsRef.current.notify[kind]) toast(tone, text);
    },
    [toast],
  );
  const [tab, setTab] = useState<Tab>("deck");
  const [side, setSide] = useState<Tab>("chat");
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [editing, setEditing] = useState<{
    layout: string[];
    selected: number | null;
  } | null>(null);
  const [confirmForget, setConfirmForget] = useState(false);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [draft, setDraft] = useState<Draft>({ text: "", platform: "" });
  const [event, setEvent] = useState<Banner | null>(null);
  const [dismissed, setDismissed] = useState<{
    black?: boolean;
    mic?: boolean;
  }>({});
  const [seen, setSeen] = useState(conn.chatSeq);
  const [summaryGone, setSummaryGone] = useState(summarySeen);
  const inputRef = useRef<HTMLInputElement>(null);
  const breakMuted = useRef(false);

  const offline = conn.link !== "open";
  const live = state.live.state === "live";
  const ctx: KeyContext = { state, t };
  const layout = effectiveLayout(state);
  const tablet = form === "tablet";
  const chatVisible = !editing && (tablet ? side === "chat" : tab === "chat");
  const unread = chatVisible ? 0 : Math.max(0, conn.chatSeq - seen);
  const mic = state.obs.mic;

  useEffect(() => {
    if (chatVisible) setSeen(conn.chatSeq);
  }, [chatVisible, conn.chatSeq]);

  const failure = useCallback(
    (e: unknown) => {
      const message =
        e instanceof Error && e.message ? e.message : t("deck.toast.failed");
      toast("bad", message);
    },
    [t, toast],
  );

  const run = useCallback(
    async (key: string, task: () => Promise<void>) => {
      setBusy((prev) => new Set(prev).add(key));
      try {
        await task();
      } catch (e) {
        failure(e);
      } finally {
        setBusy((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [failure],
  );

  const mark = useCallback(
    (label?: string) =>
      run("mark", async () => {
        buzz(20);
        const data = (await command("mark", label ? { label } : {})) as {
          marks?: PlatformMark[];
        } | null;
        const { success, warnings } = markFeedback(data?.marks ?? [], {
          t,
          locale,
        });
        if (warnings.length) toast("info", warnings[0]!);
        else
          confirm(
            "marks",
            "ok",
            label ? t("deck.toast.markedLabel", { label }) : success,
          );
      }),
    [command, confirm, locale, run, t, toast],
  );

  const setMic = useCallback(
    (muted: boolean) =>
      run("mic", async () => {
        await command("mic", { muted });
        if (!muted) breakMuted.current = false;
        confirm(
          "actions",
          "info",
          muted ? t("deck.toast.micMuted") : t("deck.toast.micOpen"),
        );
      }),
    [command, confirm, run, t],
  );

  const toggleBrb = useCallback(
    () =>
      run("brb", async () => {
        const on = !state.live.forcedBrb;
        await command("brb", { on });
        if (!on && breakMuted.current && state.obs.mic?.muted) {
          breakMuted.current = false;
          await command("mic", { muted: false });
          confirm("actions", "info", t("deck.toast.brbOffMic"));
          return;
        }
        confirm(
          "actions",
          "info",
          on ? t("deck.toast.brbOn") : t("deck.toast.brbOff"),
        );
      }),
    [command, confirm, run, state.live.forcedBrb, state.obs.mic?.muted, t],
  );

  const say = useCallback(
    (text: string, platform: string, after?: () => void) =>
      run("say", async () => {
        await command("say", platform ? { text, platform } : { text });
        after?.();
        confirm(
          "actions",
          "ok",
          platform
            ? t("deck.toast.sentOne", { platform: platformLabel(platform) })
            : t("deck.toast.sentAll"),
        );
      }),
    [command, confirm, run, t],
  );

  const pause = useCallback(
    (platform: string, paused: boolean) =>
      run(`pause:${platform}`, async () => {
        await command("pause", { platform, paused });
        const name = platformLabel(platform);
        confirm(
          "actions",
          "info",
          paused
            ? t("deck.toast.paused", { platform: name })
            : t("deck.toast.resumed", { platform: name }),
        );
      }),
    [command, confirm, run, t],
  );

  const scene = useCallback(
    (name: string) =>
      run("scene", async () => {
        await command("scene", { name });
        setDismissed((d) => ({ ...d, black: false }));
        confirm("actions", "ok", t("deck.toast.scene", { scene: name }));
      }),
    [command, confirm, run, t],
  );

  const saveTitle = useCallback(
    (title: string, game: string) =>
      run("title", async () => {
        const results = ((await command(
          "title",
          game ? { title, game } : { title },
        )) ?? {}) as TitleResults;
        const entries = Object.entries(results);
        const failed = entries.find(([, r]) => !r.ok);
        const warned = entries.find(([, r]) => r.ok && r.warn);
        if (failed)
          toast(
            "bad",
            `${platformLabel(failed[0])}: ${failed[1].error ?? t("deck.toast.failed")}`,
          );
        else if (warned)
          toast("info", `${platformLabel(warned[0])}: ${warned[1].warn}`);
        else if (entries.length)
          confirm(
            "actions",
            "ok",
            t("deck.toast.titleAll", {
              platforms: entries.map(([p]) => platformLabel(p)).join(", "),
            }),
          );
        else confirm("actions", "info", t("deck.toast.titleSaved"));
      }),
    [command, confirm, run, t, toast],
  );

  const chatOk = state.chatPlatforms.length > 0;

  const takeBreak = useCallback(
    () =>
      run("break", async () => {
        if (!state.live.forcedBrb) await command("brb", { on: true });
        if (state.obs.connected && state.obs.mic && !state.obs.mic.muted) {
          await command("mic", { muted: true });
          breakMuted.current = true;
        }
        if (chatOk) await command("say", { text: t("deck.combo.break.chat") });
        await command("mark", { label: t("deck.labels.break") });
        buzz(30);
        confirm(
          "actions",
          "ok",
          chatOk ? t("deck.toast.break") : t("deck.toast.breakNoChat"),
        );
      }),
    [
      chatOk,
      command,
      confirm,
      run,
      state.live.forcedBrb,
      state.obs.connected,
      state.obs.mic,
      t,
    ],
  );

  const sayBye = useCallback(
    () =>
      run("bye", async () => {
        if (chatOk) await command("say", { text: t("deck.combo.bye.chat") });
        await command("mark", { label: t("deck.combo.bye.mark") });
        confirm(
          "actions",
          "ok",
          chatOk ? t("deck.toast.bye") : t("deck.toast.byeNoChat"),
        );
      }),
    [chatOk, command, confirm, run, t],
  );

  const goLive = useCallback(
    () =>
      run("start", async () => {
        await command("start", {}, 70_000);
        confirm("actions", "ok", t("golive.toast.live"));
      }),
    [command, confirm, run, t],
  );

  const stop = useCallback(
    () =>
      run("stop", async () => {
        await command("stop", {}, 70_000);
        buzz(40);
        confirm("actions", "ok", t("deck.toast.stopped"));
      }),
    [command, confirm, run, t],
  );

  const openReply = useCallback(
    (message: DeckChat) => {
      setEvent(null);
      setDraft({
        text: `@${message.author} `,
        platform: state.chatPlatforms.includes(message.platform)
          ? message.platform
          : "",
      });
      if (tablet) setSide("chat");
      else setTab("chat");
      setTimeout(() => {
        const input = inputRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }, 0);
    },
    [state.chatPlatforms, tablet],
  );

  /** Runs the steps in order; one that fails does not stop the rest. */
  const runCombo = useCallback(
    (combo: DeckCombo) =>
      run(`combo:${combo.id}`, async () => {
        const errors: string[] = [];
        for (const step of combo.steps) {
          try {
            switch (step.action) {
              case "mark":
                await command("mark", step.label ? { label: step.label } : {});
                break;
              case "brb":
                await command("brb", { on: !!step.on });
                break;
              case "mic":
                await command("mic", { muted: !!step.muted });
                break;
              case "scene":
                await command("scene", { name: step.scene });
                break;
              case "say":
                await command(
                  "say",
                  step.platform
                    ? { text: step.text, platform: step.platform }
                    : { text: step.text },
                );
                break;
              case "pause":
                await command("pause", {
                  platform: step.platform,
                  paused: !!step.paused,
                });
                break;
              case "wait":
                await new Promise((r) =>
                  setTimeout(r, (step.seconds ?? 3) * 1000),
                );
                break;
            }
          } catch (e) {
            errors.push(
              e instanceof Error && e.message
                ? e.message
                : t("deck.toast.failed"),
            );
          }
        }
        if (errors.length)
          toast(
            "bad",
            t("deck.toast.comboPartial", {
              name: combo.name,
              done: combo.steps.length - errors.length,
              total: combo.steps.length,
              error: errors[0]!,
            }),
          );
        else {
          buzz(30);
          confirm("actions", "ok", t("deck.toast.combo", { name: combo.name }));
        }
      }),
    [command, confirm, run, t, toast],
  );

  const saveCombos = useCallback(
    (next: DeckCombo[], done: () => void) =>
      run("combos", async () => {
        await command("combos", { combos: next });
        done();
      }),
    [command, run],
  );

  const onKey = (id: string) => {
    const combo = findCombo(id, state);
    if (combo) return runCombo(combo);
    const platform = pausePlatform(id);
    if (platform) return pause(platform, !platformPaused(state, platform));
    switch (id) {
      case "mark":
        return mark();
      case "brb":
        return toggleBrb();
      case "mic":
        return setMic(!mic?.muted);
      case "scene":
        return setSheet({ kind: "scene" });
      case "title":
        return setSheet({ kind: "title" });
      case "say":
        return setSheet({ kind: "say" });
      case "stop":
        return stop();
      case "break":
        return takeBreak();
      case "bye":
        return sayBye();
    }
  };

  // A new chat alert or @mention takes the event banner for a while.
  const lastEvent = useRef(conn.event?.seq ?? 0);
  useEffect(() => {
    const next = conn.event;
    if (!next || next.seq === lastEvent.current) return;
    lastEvent.current = next.seq;
    let banner: Banner;
    if ("alert" in next) {
      const alert = next.alert;
      if (!alertWanted(alert, prefsRef.current.notify)) return;
      const meta = ALERT_KIND_META[alert.kind as AlertKind];
      if (!meta) return;
      const detail = alertDetail(
        {
          ...alert,
          kind: alert.kind as AlertKind,
          amount: alert.amount ?? undefined,
          currency: alert.currency ?? undefined,
          tier: alert.tier ?? undefined,
        },
        { t, tp },
      );
      const where = platformLabel(alert.platform);
      const canThank = state.chatPlatforms.length > 0;
      banner = {
        id: "event",
        tone: "brass",
        polite: true,
        icon: (
          <span className="emoji" aria-hidden>
            {meta.emoji}
          </span>
        ),
        title: `${alert.user} ${t(meta.verbKey)}`,
        body: [detail, where].filter(Boolean).join(" · "),
        dismissible: true,
        action:
          alert.kind === "raid"
            ? {
                label: t("deck.event.markRaid"),
                icon: <MapPin className="ic" aria-hidden />,
                run: () => {
                  setEvent(null);
                  void mark(t("deck.labels.raid"));
                },
              }
            : canThank
              ? {
                  label: t("deck.event.thank"),
                  run: () => {
                    setEvent(null);
                    const platform = state.chatPlatforms.includes(
                      alert.platform,
                    )
                      ? alert.platform
                      : "";
                    void say(
                      t("deck.event.thanks", { user: alert.user }),
                      platform,
                    );
                  },
                }
              : undefined,
      };
    } else {
      if (!prefsRef.current.notify.mentions) return;
      const message = next.mention;
      banner = {
        id: "event",
        tone: "brass",
        polite: true,
        icon: <MessageSquareReply className="ic" aria-hidden />,
        title: t("deck.event.mention", {
          user: message.author,
          platform: platformLabel(message.platform),
        }),
        body: `“${message.text}”`,
        dismissible: true,
        action: state.chatPlatforms.length
          ? { label: t("deck.chat.reply"), run: () => openReply(message) }
          : undefined,
      };
    }
    buzz(30);
    setEvent(banner);
  }, [conn.event, mark, openReply, say, state.chatPlatforms, t, tp]);

  const alertMs = ALERT_TIME_MS[prefs.alertTime];
  useEffect(() => {
    if (!event || alertMs === null) return;
    const timer = setTimeout(() => setEvent(null), alertMs);
    return () => clearTimeout(timer);
  }, [event, alertMs]);

  const blackOn = live && state.live.blackScreen;
  const micMutedLive =
    live && !state.live.forcedBrb && !!mic?.muted && prefs.notify.micMuted;
  const signalLost = live && state.live.signalLost;

  // A dismissed alarm comes back the next time the problem starts.
  useEffect(() => {
    if (!blackOn) setDismissed((d) => (d.black ? { ...d, black: false } : d));
  }, [blackOn]);
  useEffect(() => {
    if (!micMutedLive) setDismissed((d) => (d.mic ? { ...d, mic: false } : d));
  }, [micMutedLive]);
  useEffect(() => {
    if (blackOn || signalLost) buzz(70);
  }, [blackOn, signalLost]);

  const banners = useMemo(() => {
    const list: Banner[] = [];
    if (offline)
      list.push({
        id: "link",
        tone: "warn",
        icon: ALERT_ICONS.link,
        title: t("deck.link.title"),
        body: live ? t("deck.link.bodyLive") : t("deck.link.body"),
        action: {
          label: t("deck.link.retry"),
          icon: ALERT_ICONS.retry,
          run: conn.reconnect,
        },
      });
    if (blackOn && !dismissed.black)
      list.push({
        id: "black",
        tone: "bad",
        icon: ALERT_ICONS.black,
        title: t("deck.alert.black.title"),
        body: t("deck.alert.black.body"),
        action:
          state.obs.connected && state.obs.scenes.length
            ? {
                label: t("deck.alert.black.action"),
                icon: ALERT_ICONS.scene,
                run: () => setSheet({ kind: "scene" }),
              }
            : undefined,
        dismissible: true,
      });
    if (signalLost)
      list.push({
        id: "signal",
        tone: "bad",
        icon: ALERT_ICONS.signal,
        title: t("deck.alert.signal.title"),
        body: state.live.brbArmed
          ? t("deck.alert.signal.bodyBrb")
          : t("deck.alert.signal.body"),
      });
    if (micMutedLive && !dismissed.mic)
      list.push({
        id: "mic",
        tone: "bad",
        icon: ALERT_ICONS.mic,
        title: t("deck.alert.mic.title"),
        body: t("deck.alert.mic.body"),
        action: {
          label: t("deck.alert.mic.action"),
          icon: ALERT_ICONS.openMic,
          run: () => void setMic(false),
        },
        dismissible: true,
      });
    const reconnecting = state.targets.filter(
      (target) => target.state === "reconnecting",
    );
    if (live && reconnecting.length)
      list.push({
        id: "reconnecting",
        tone: "warn",
        polite: true,
        icon: ALERT_ICONS.reconnecting,
        title: t("deck.alert.reconnecting.title", {
          platforms: reconnecting
            .map((target) => chipName(state, target))
            .join(", "),
        }),
        body: t("deck.alert.reconnecting.body"),
      });
    if (event) list.push(event);
    return list;
  }, [
    blackOn,
    conn.reconnect,
    dismissed,
    event,
    live,
    micMutedLive,
    offline,
    setMic,
    signalLost,
    state,
    t,
  ]);

  const dismiss = (id: string) => {
    if (id === "event") setEvent(null);
    if (id === "black" || id === "mic")
      setDismissed((d) => ({ ...d, [id]: true }));
  };

  const startEdit = () => {
    setSheet(null);
    setTab("deck");
    setEditing({ layout, selected: null });
  };

  const finishEdit = () => {
    if (!editing) return;
    const keys = editing.layout;
    if (keys.join() === layout.join()) {
      setEditing(null);
      return;
    }
    void run("layout", async () => {
      await command("layout", { keys });
      setEditing(null);
      toast("ok", t("deck.toast.layoutSaved"));
    });
  };

  const forget = () => {
    if (!confirmForget) {
      setConfirmForget(true);
      setTimeout(() => setConfirmForget(false), 4000);
      return;
    }
    setSheet(null);
    conn.forget();
  };

  const closeSheet = useCallback(() => setSheet(null), []);

  const sessionEnded =
    state.session.endedAt !== null &&
    state.session.startedAt !== null &&
    !live &&
    state.live.state !== "starting" &&
    summaryGone !== state.session.startedAt;

  const composing = !tablet && !editing && tab === "chat";
  const root = [
    "deck",
    form,
    orient,
    composing && "composing",
    `keys-${prefs.keys}`,
    `cols-${prefs.columns}`,
    `chat-${prefs.chat}`,
    `alerts-${prefs.alerts}`,
    prefs.hand === "left" && "left",
  ]
    .filter(Boolean)
    .join(" ");

  if (sessionEnded)
    return (
      <div className={root}>
        <Summary
          session={state.session}
          onCopied={(ok) =>
            toast(
              ok ? "ok" : "bad",
              ok
                ? t("deck.toast.copied", { n: state.session.marks.length })
                : t("deck.toast.copyFailed"),
            )
          }
          onDone={() => {
            const started = state.session.startedAt;
            setSummaryGone(started);
            try {
              window.sessionStorage.setItem(SUMMARY_SEEN, String(started));
            } catch {
              // Without storage the summary shows again after a reload.
            }
          }}
        />
        <Toasts items={toasts.items} onDismiss={toasts.dismiss} />
      </div>
    );

  const head = editing ? (
    <header className="edit-head">
      <h2>{t("deck.edit.title")}</h2>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() =>
          setEditing({
            layout: DEFAULT_LAYOUT.filter((id) => isAction(id, state)),
            selected: null,
          })
        }
      >
        <RotateCcw className="ic" aria-hidden />
        {t("deck.edit.reset")}
      </button>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={finishEdit}
        aria-busy={busy.has("layout") || undefined}
        data-on-brass
      >
        {t("deck.edit.done")}
      </button>
    </header>
  ) : (
    <Head
      state={state}
      receivedAt={conn.receivedAt}
      onMenu={() => setSheet({ kind: "menu" })}
    />
  );

  const plats = editing ? null : (
    <Plats
      state={state}
      onOpen={(target) => setSheet({ kind: "target", id: target.id })}
    />
  );

  const alerts = editing ? null : (
    <Alerts items={banners} onDismiss={dismiss} />
  );

  const deckContent = editing ? (
    <EditGrid
      layout={editing.layout}
      ctx={ctx}
      selected={editing.selected}
      onPick={(i) => {
        const { selected } = editing;
        if (selected === null) setEditing({ ...editing, selected: i });
        else if (selected === i) setEditing({ ...editing, selected: null });
        else {
          buzz(10);
          setEditing({
            layout: swap(editing.layout, selected, i),
            selected: null,
          });
        }
      }}
      onRemove={(i) =>
        setEditing({
          layout: editing.layout.filter((_, j) => j !== i),
          selected: null,
        })
      }
      onAdd={() => setSheet({ kind: "catalog" })}
    />
  ) : live ? (
    <Grid
      layout={layout}
      ctx={ctx}
      busy={busy}
      offline={offline}
      onKey={onKey}
      onLabels={() => setSheet({ kind: "labels" })}
      onBlocked={(why) => toast("info", why)}
      onTooShort={(id) =>
        id === "stop" && toast("info", t("deck.key.stop.hint"))
      }
    />
  ) : (
    <Ready
      state={state}
      offline={offline}
      busy={busy.has("start")}
      onTitle={() => setSheet({ kind: "title" })}
      onGoLive={goLive}
      onBlocked={(why) => toast("info", why)}
    />
  );

  const chat = (
    <Chat
      messages={conn.chat}
      canReply={(platform) =>
        state.chatPlatforms.includes(platform) && !offline
      }
      onReply={openReply}
    />
  );
  const health = (
    <Health
      state={state}
      onTarget={(target) => setSheet({ kind: "target", id: target.id })}
      onMic={() => void setMic(!mic?.muted)}
    />
  );
  const composer = (
    <Composer
      platforms={state.chatPlatforms}
      draft={draft}
      onDraft={setDraft}
      busy={busy.has("say") || offline}
      inputRef={inputRef}
      onSend={() =>
        void say(draft.text.trim(), draft.platform, () =>
          setDraft((d) => ({ ...d, text: "" })),
        )
      }
    />
  );

  const target =
    sheet?.kind === "target"
      ? state.targets.find((x) => x.id === sheet.id)
      : undefined;
  const sheets = sheet && (
    <>
      {sheet.kind === "labels" && (
        <LabelsSheet
          onClose={closeSheet}
          onMark={(label) => {
            setSheet(null);
            void mark(label);
          }}
        />
      )}
      {sheet.kind === "scene" && (
        <SceneSheet
          state={state}
          onClose={closeSheet}
          onPick={(name) => {
            setSheet(null);
            void scene(name);
          }}
        />
      )}
      {sheet.kind === "title" && (
        <TitleSheet
          state={state}
          onClose={closeSheet}
          onSave={(title, game) => {
            setSheet(null);
            void saveTitle(title, game);
          }}
        />
      )}
      {sheet.kind === "say" && (
        <SaySheet
          state={state}
          onClose={closeSheet}
          onSay={(text, platform) => {
            setSheet(null);
            void say(text, platform);
          }}
        />
      )}
      {sheet.kind === "target" && target && (
        <TargetSheet
          state={state}
          target={target}
          onClose={closeSheet}
          onPause={(platform, paused) => {
            setSheet(null);
            void pause(platform, paused);
          }}
        />
      )}
      {sheet.kind === "menu" && (
        <MenuSheet
          state={state}
          deviceName={state.device?.name ?? deviceName}
          confirming={confirmForget}
          onClose={closeSheet}
          onEdit={startEdit}
          onPrefs={() => setSheet({ kind: "prefs" })}
          onCombos={() => setSheet({ kind: "combos" })}
          onHow={() => setSheet({ kind: "how" })}
          onForget={forget}
        />
      )}
      {sheet.kind === "how" && <HowSheet onClose={closeSheet} />}
      {sheet.kind === "prefs" && (
        <PrefsSheet
          prefs={prefs}
          samplePlatform={state.chatPlatforms[0] ?? state.targets[0]?.platform}
          onChange={setPrefs}
          onClose={closeSheet}
        />
      )}
      {sheet.kind === "combos" && (
        <CombosSheet
          state={state}
          onClose={closeSheet}
          onEdit={(id) => setSheet({ kind: "combo", id, back: "combos" })}
        />
      )}
      {sheet.kind === "combo" && (
        <ComboEditor
          key={sheet.id ?? "new"}
          state={state}
          combo={state.combos.find((c) => c.id === sheet.id) ?? null}
          busy={busy.has("combos")}
          onClose={() =>
            setSheet(sheet.back === "combos" ? { kind: "combos" } : null)
          }
          onSave={(combo) => {
            const exists = state.combos.some((c) => c.id === combo.id);
            const next = exists
              ? state.combos.map((c) => (c.id === combo.id ? combo : c))
              : [...state.combos, combo];
            void saveCombos(next, () => {
              confirm(
                "actions",
                "ok",
                t("deck.toast.comboSaved", { name: combo.name }),
              );
              // A combo made from the catalog while editing goes straight onto the deck.
              if (!exists && sheet.back === "catalog")
                setEditing((current) =>
                  current && current.layout.length < MAX_KEYS
                    ? {
                        layout: [...current.layout, `combo:${combo.id}`],
                        selected: null,
                      }
                    : current,
                );
              setSheet(sheet.back === "combos" ? { kind: "combos" } : null);
            });
          }}
          onDelete={(id) => {
            const gone = state.combos.find((c) => c.id === id);
            void saveCombos(
              state.combos.filter((c) => c.id !== id),
              () => {
                if (gone)
                  confirm(
                    "actions",
                    "info",
                    t("deck.toast.comboDeleted", { name: gone.name }),
                  );
                setEditing((current) =>
                  current
                    ? {
                        layout: current.layout.filter(
                          (key) => key !== `combo:${id}`,
                        ),
                        selected: null,
                      }
                    : current,
                );
                setSheet(sheet.back === "combos" ? { kind: "combos" } : null);
              },
            );
          }}
        />
      )}
      {sheet.kind === "catalog" && editing && (
        <CatalogSheet
          ctx={ctx}
          layout={editing.layout}
          canCreate={state.combos.length < MAX_COMBOS}
          onCreate={() =>
            setSheet({ kind: "combo", id: null, back: "catalog" })
          }
          onClose={closeSheet}
          onAdd={(id) => {
            setSheet(null);
            if (editing.layout.length < MAX_KEYS)
              setEditing({ layout: [...editing.layout, id], selected: null });
          }}
        />
      )}
    </>
  );

  const overlays = (
    <>
      <Toasts items={toasts.items} onDismiss={toasts.dismiss} />
      {sheets}
    </>
  );

  if (tablet)
    return (
      <div className={root}>
        <div className="t-top">
          {head}
          {plats}
        </div>
        <div className={`t-main ${editing ? "solo" : ""}`}>
          <section className="deckpane" aria-label={t("deck.tabs.deck")}>
            {alerts}
            <div className="body scroll">{deckContent}</div>
          </section>
          {!editing && (
            <aside className="sidepanel" aria-label={t("deck.side.label")}>
              <Tabs
                tab={side}
                onTab={setSide}
                unread={unread}
                tabs={["chat", "health"]}
                className="side-tabs"
              />
              <div className="side-body scroll">
                {side === "chat" ? chat : health}
              </div>
              {side === "chat" && composer}
            </aside>
          )}
        </div>
        {overlays}
      </div>
    );

  const body = editing
    ? deckContent
    : tab === "chat"
      ? chat
      : tab === "health"
        ? health
        : deckContent;
  const tabs = editing ? null : (
    <Tabs tab={tab} onTab={setTab} unread={unread} />
  );

  if (orient === "landscape")
    return (
      <div className={root}>
        <div className="rail">
          {head}
          {plats}
          {tabs}
        </div>
        <div className="main">
          {alerts}
          <div className="body scroll" key={editing ? "edit" : tab}>
            {body}
          </div>
          {tab === "chat" && !editing && composer}
        </div>
        {overlays}
      </div>
    );

  return (
    <div className={root}>
      {head}
      {plats}
      {alerts}
      <div className="body scroll" key={editing ? "edit" : tab}>
        {body}
      </div>
      {tab === "chat" && !editing && composer}
      {tabs}
      {overlays}
    </div>
  );
}
