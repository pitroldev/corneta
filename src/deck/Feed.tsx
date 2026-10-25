import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import {
  ChevronRight,
  Layers,
  MessagesSquare,
  Reply,
  Send,
} from "lucide-react";
import { useI18n } from "../lib/i18n";
import {
  targetTone,
  type DeckChat,
  type DeckState,
  type DeckTarget,
} from "./model";
import { chipName, stateText } from "./parts";
import { PlatformGlyph, platformLabel } from "./ui";

export interface Draft {
  text: string;
  /** Empty sends to every chat. */
  platform: string;
}

/** Keeps the newest line in view unless the streamer scrolled up to read. */
function useStickToBottom(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const box = ref.current?.closest(".scroll");
    if (!box) return;
    const onScroll = () => {
      stick.current = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
    };
    box.addEventListener("scroll", onScroll, { passive: true });
    box.scrollTop = box.scrollHeight;
    return () => box.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => {
    const box = ref.current?.closest(".scroll");
    if (box && stick.current) box.scrollTop = box.scrollHeight;
  }, [dep]);
  return ref;
}

export function Chat({
  messages,
  canReply,
  onReply,
}: {
  messages: DeckChat[];
  canReply: (platform: string) => boolean;
  onReply: (message: DeckChat) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const ref = useStickToBottom(messages[messages.length - 1]?.id);
  if (!messages.length)
    return (
      <div className="empty" ref={ref}>
        <MessagesSquare className="ic" aria-hidden />
        <b>{t("deck.chat.emptyTitle")}</b>
        <p>{t("deck.chat.empty")}</p>
      </div>
    );
  return (
    <div
      className="feed"
      ref={ref}
      role="log"
      aria-label={t("deck.tabs.chat")}
      aria-live="off"
    >
      {messages.map((m) => {
        if (m.system)
          return (
            <p key={m.id} className="msg system">
              <PlatformGlyph platform={m.platform} size={13} />
              {m.text}
            </p>
          );
        const expanded = open === m.id;
        const reply = canReply(m.platform);
        return (
          <div key={m.id}>
            <button
              type="button"
              className={`msg ${expanded ? "open" : ""}`}
              aria-expanded={reply ? expanded : undefined}
              onClick={() => reply && setOpen(expanded ? null : m.id)}
            >
              <PlatformGlyph platform={m.platform} size={13} />
              <span
                className="who"
                style={m.color ? { color: m.color } : undefined}
              >
                {m.author}
              </span>
              {m.highlight === "first" && (
                <span className="chip first">{t("deck.chat.first")}</span>
              )}
              {m.highlight === "returning" && (
                <span className="chip back">{t("deck.chat.returning")}</span>
              )}
              <span className="txt">{m.text}</span>
            </button>
            {expanded && (
              <div className="msg-acts">
                <button
                  type="button"
                  className="btn btn-subtle btn-sm"
                  onClick={() => {
                    setOpen(null);
                    onReply(m);
                  }}
                >
                  <Reply className="ic" aria-hidden />
                  {t("deck.chat.reply")}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Composer({
  platforms,
  draft,
  onDraft,
  onSend,
  busy,
  inputRef,
}: {
  platforms: string[];
  draft: Draft;
  onDraft: (draft: Draft) => void;
  onSend: () => void;
  busy: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useI18n();
  if (!platforms.length)
    return <p className="composer note">{t("deck.chat.noSend")}</p>;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.text.trim() && !busy) onSend();
  };
  return (
    <form className="composer" autoComplete="off" onSubmit={submit}>
      {platforms.length > 1 && (
        <button
          type="button"
          className="dest"
          onClick={() => {
            const order = ["", ...platforms];
            onDraft({
              ...draft,
              platform:
                order[(order.indexOf(draft.platform) + 1) % order.length]!,
            });
          }}
          aria-label={t("deck.chat.toCycle", {
            platform: draft.platform
              ? platformLabel(draft.platform)
              : t("deck.chat.toAll"),
          })}
        >
          {draft.platform ? (
            <PlatformGlyph platform={draft.platform} size={18} />
          ) : (
            <Layers className="ic" aria-hidden />
          )}
          <span>
            {draft.platform
              ? platformLabel(draft.platform)
              : t("deck.chat.toAllShort")}
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        className="input"
        value={draft.text}
        maxLength={200}
        enterKeyHint="send"
        placeholder={t("deck.chat.placeholder")}
        aria-label={t("deck.chat.message")}
        onChange={(e) => onDraft({ ...draft, text: e.target.value })}
      />
      <button
        type="submit"
        className="btn btn-primary"
        aria-label={t("deck.chat.send")}
        aria-disabled={!draft.text.trim() || busy ? true : undefined}
        data-on-brass
      >
        <Send className="ic" aria-hidden />
      </button>
    </form>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <div className="bar" aria-hidden>
      <i
        className={value > 85 ? "warn" : ""}
        style={{ ["--v" as string]: Math.min(1, value / 100) }}
      />
    </div>
  );
}

export function Health({
  state,
  onTarget,
  onMic,
}: {
  state: DeckState;
  onTarget: (target: DeckTarget) => void;
  onMic: () => void;
}) {
  const { t, fmt } = useI18n();
  const viewers = new Map(
    state.viewers.items.map((v) => [v.platform, v.viewers]),
  );
  const mic = state.obs.mic;
  const { cpu, gpu } = state.machine;
  const protections = [
    {
      id: "brb",
      on: state.protections.brb,
      name: t("deck.health.protect.brb"),
      desc: t("deck.health.protect.brb.desc"),
    },
    {
      id: "autoBitrate",
      on: state.protections.autoBitrate,
      name: t("deck.health.protect.autoBitrate"),
      desc: t("deck.health.protect.autoBitrate.desc"),
    },
    {
      id: "blackScreen",
      on: state.protections.blackScreen,
      name: t("deck.health.protect.blackScreen"),
      desc: t("deck.health.protect.blackScreen.desc"),
    },
    {
      id: "guardian",
      on: state.protections.guardian,
      name: t("deck.health.protect.guardian"),
      desc: t("deck.health.protect.guardian.desc"),
    },
  ];
  return (
    <>
      <h3 className="sec first">{t("deck.health.platforms")}</h3>
      {state.targets.length ? (
        <div className="group">
          {state.targets.map((target) => {
            const on = ["live", "brb", "reconnecting"].includes(target.state);
            const count = viewers.get(target.platform);
            const detail = on
              ? [
                  fmt.bitrate(target.bitrateKbps),
                  t("deck.health.fps", { n: target.fps }),
                  t("deck.health.dropped", { n: fmt.num(target.dropped) }),
                  count !== undefined &&
                    t("deck.health.watching", { n: fmt.num(count) }),
                ]
                  .filter(Boolean)
                  .join(" · ")
              : target.state === "paused"
                ? t("deck.health.pausedDetail")
                : t("deck.health.offDetail");
            return (
              <button
                key={target.id}
                type="button"
                className="row"
                onClick={() => onTarget(target)}
              >
                <span className="tile">
                  <PlatformGlyph platform={target.platform} size={19} />
                </span>
                <span className="main">
                  <b>{chipName(state, target)}</b>
                  <small className="tnum">{detail}</small>
                </span>
                <span className={`end ${targetTone(target.state)}`}>
                  {stateText(t, target.state)}
                </span>
                <ChevronRight className="ic chev" aria-hidden />
              </button>
            );
          })}
        </div>
      ) : (
        <p className="fine pad">{t("deck.ready.platformsNone")}</p>
      )}
      <h3 className="sec">{t("deck.health.mic")}</h3>
      <div className="group">
        <div className="row">
          <span className="main">
            <b>
              {mic
                ? mic.name
                : state.obs.connected
                  ? t("deck.key.mic.none")
                  : t("deck.key.obsOff")}
            </b>
            <small>
              {mic
                ? mic.muted
                  ? t("deck.health.micMuted")
                  : t("deck.health.micOpen")
                : t("deck.health.micHint")}
            </small>
          </span>
          {mic && (
            <button
              type="button"
              className={`btn btn-sm ${mic.muted ? "btn-primary" : "btn-subtle"}`}
              onClick={onMic}
              data-on-brass={mic.muted ? true : undefined}
            >
              {mic.muted ? t("deck.alert.mic.action") : t("deck.health.mute")}
            </button>
          )}
        </div>
      </div>
      {(cpu != null || gpu != null) && (
        <>
          <h3 className="sec">
            {t("deck.health.pc")}{" "}
            <span className="fine">{t("deck.health.pcHint")}</span>
          </h3>
          <div className="group">
            {cpu != null && (
              <div className="row stack">
                <div className="spread">
                  <b>{t("deck.health.cpu")}</b>
                  <span className="tnum">{Math.round(cpu)}%</span>
                </div>
                <Bar value={cpu} />
              </div>
            )}
            {gpu != null && (
              <div className="row stack">
                <div className="spread">
                  <b>{t("deck.health.gpu")}</b>
                  <span className="tnum">{Math.round(gpu)}%</span>
                </div>
                <Bar value={gpu} />
              </div>
            )}
          </div>
        </>
      )}
      <h3 className="sec">{t("deck.health.protections")}</h3>
      <div className="group">
        {protections.map(({ id, on, name, desc }) => (
          <div key={id} className="row">
            <span className="main">
              <b>{name}</b>
              <small>{desc}</small>
            </span>
            <span className={`end ${on ? "ok" : "faint"}`}>
              {on ? t("deck.health.armed") : t("deck.health.off")}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
