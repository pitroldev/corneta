import { useId, useRef, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Check,
  ChevronRight,
  LoaderCircle,
  MicVocal,
  PenLine,
  Plug,
  Plus,
  Radio,
  Shield,
  Tag,
  TriangleAlert,
  TvMinimal,
  X,
} from "lucide-react";
import { useI18n } from "../lib/i18n";
import {
  GO_LIVE_HOLD_MS,
  keyView,
  type KeyContext,
  type KeyView,
} from "./keys";
import { MAX_KEYS, type DeckState } from "./model";
import { buzz, platformLabel, useHold } from "./ui";

const LONG_PRESS_MS = 480;

interface KeyProps {
  id: string;
  view: KeyView;
  wide: boolean;
  busy: boolean;
  offline: boolean;
  onPress: () => void;
  onBlocked: (why: string) => void;
  onLongPress?: () => void;
  onTooShort?: () => void;
}

function keyClass(view: KeyView, wide: boolean, busy: boolean) {
  return ["key", wide && "wide-key", view.tone, busy && "busy"]
    .filter(Boolean)
    .join(" ");
}

function KeyFace({
  view,
  busy,
  holding,
}: {
  view: KeyView;
  busy: boolean;
  holding?: string;
}) {
  const Icon = busy ? LoaderCircle : view.icon;
  return (
    <>
      {view.hold && <span className="fill" />}
      <Icon className={busy ? "ic spin" : "ic"} aria-hidden />
      <span className="t">
        <b>{holding ?? view.label}</b>
        <small>{view.sub}</small>
      </span>
    </>
  );
}

function HoldKey({
  view,
  wide,
  busy,
  offline,
  onPress,
  onBlocked,
  onTooShort,
}: KeyProps) {
  const { t } = useI18n();
  const blocked = offline ? t("deck.link.offToast") : view.blocked;
  const hold = useHold<HTMLButtonElement>(
    view.hold ?? 1000,
    onPress,
    () => onTooShort?.(),
    !!blocked || busy,
  );
  return (
    <button
      type="button"
      ref={hold.ref}
      className={`${keyClass(view, wide, busy)} ${hold.holding ? "holding" : ""}`}
      aria-disabled={blocked ? true : undefined}
      aria-busy={busy || undefined}
      {...hold.handlers}
      onClick={() => blocked && onBlocked(blocked)}
    >
      <KeyFace
        view={view}
        busy={busy}
        holding={hold.holding ? t("deck.key.holding") : undefined}
      />
    </button>
  );
}

function TapKey({
  view,
  wide,
  busy,
  offline,
  onPress,
  onBlocked,
  onLongPress,
}: KeyProps) {
  const { t } = useI18n();
  const blocked = offline ? t("deck.link.offToast") : view.blocked;
  const press = useRef<{
    timer: ReturnType<typeof setTimeout>;
    fired: boolean;
  } | null>(null);
  const release = () => {
    if (press.current) clearTimeout(press.current.timer);
  };
  return (
    <button
      type="button"
      className={keyClass(view, wide, busy)}
      aria-pressed={view.pressed}
      aria-disabled={blocked ? true : undefined}
      aria-busy={busy || undefined}
      data-on-brass={
        view.tone === "brand" || view.tone === "on" ? true : undefined
      }
      onPointerDown={(e) => {
        if (e.button !== 0 || !onLongPress || blocked) return;
        const state = {
          fired: false,
          timer: setTimeout(() => {
            state.fired = true;
            buzz(25);
            onLongPress();
          }, LONG_PRESS_MS),
        };
        press.current = state;
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onContextMenu={(e) => onLongPress && e.preventDefault()}
      onClick={() => {
        const fired = press.current?.fired;
        press.current = null;
        if (fired) return;
        if (blocked) onBlocked(blocked);
        else if (!busy) onPress();
      }}
    >
      <KeyFace view={view} busy={busy} />
    </button>
  );
}

export function Grid({
  layout,
  ctx,
  busy,
  offline,
  onKey,
  onLabels,
  onBlocked,
  onTooShort,
}: {
  layout: string[];
  ctx: KeyContext;
  busy: ReadonlySet<string>;
  offline: boolean;
  onKey: (id: string) => void;
  onLabels: () => void;
  onBlocked: (why: string) => void;
  onTooShort: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid">
      {layout.map((id, i) => {
        const view = keyView(id, ctx);
        const wide = i === 0;
        const props: KeyProps = {
          id,
          view,
          wide,
          busy: busy.has(id),
          offline,
          onPress: () => onKey(id),
          onBlocked,
          onTooShort: () => onTooShort(id),
          onLongPress: id === "mark" ? onLabels : undefined,
        };
        return (
          <div
            key={id}
            className={`slot ${wide ? "wide" : ""} ${wide && id === "mark" ? "has-side" : ""}`}
          >
            {view.hold ? <HoldKey {...props} /> : <TapKey {...props} />}
            {wide && id === "mark" && (
              <button
                type="button"
                className="side"
                onClick={() =>
                  offline ? onBlocked(t("deck.link.offToast")) : onLabels()
                }
                aria-label={t("deck.key.mark.withName")}
                data-on-brass
              >
                <Tag className="ic" aria-hidden />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function EditGrid({
  layout,
  ctx,
  selected,
  onPick,
  onRemove,
  onAdd,
}: {
  layout: string[];
  ctx: KeyContext;
  selected: number | null;
  onPick: (index: number) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  const picked = selected !== null ? layout[selected] : undefined;
  return (
    <>
      <p className="edit-hint" aria-live="polite">
        <ArrowLeftRight className="ic" aria-hidden />
        <span>
          {picked
            ? t("deck.edit.hintPicked", { label: keyView(picked, ctx).label })
            : layout.length
              ? t("deck.edit.hint")
              : t("deck.edit.empty")}
        </span>
      </p>
      <div className="grid editing">
        {layout.map((id, i) => {
          const view = keyView(id, ctx);
          const Icon = view.icon;
          return (
            <div
              key={id}
              className={`slot ${i === 0 ? "wide" : ""} ${selected === i ? "sel" : ""}`}
            >
              <button
                type="button"
                className={keyClass(
                  {
                    ...view,
                    tone: view.tone === "brand" ? "brand" : undefined,
                  },
                  i === 0,
                  false,
                )}
                aria-pressed={selected === i}
                onClick={() => onPick(i)}
                data-on-brass={view.tone === "brand" ? true : undefined}
              >
                <Icon className="ic" aria-hidden />
                <span className="t">
                  <b>{view.label}</b>
                  <small>{i === 0 ? t("deck.edit.wide") : view.sub}</small>
                </span>
              </button>
              <button
                type="button"
                className="remove"
                onClick={() => onRemove(i)}
                aria-label={t("deck.edit.remove", { label: view.label })}
              >
                <X className="ic" aria-hidden />
              </button>
            </div>
          );
        })}
        {layout.length < MAX_KEYS && (
          <div className="slot">
            <button type="button" className="addslot" onClick={onAdd}>
              <Plus className="ic" aria-hidden />
              {t("deck.edit.add")}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function ReadyRow({
  icon,
  title,
  detail,
  end,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  end:
    | { kind: "check" }
    | { kind: "text"; text: string; tone: "ok" | "warn" | "faint" }
    | { kind: "warn" };
}) {
  return (
    <div className="row">
      <span className="tile">{icon}</span>
      <span className="main">
        <b>{title}</b>
        <small>{detail}</small>
      </span>
      {end.kind === "check" ? (
        <Check className="ic check" aria-hidden />
      ) : end.kind === "warn" ? (
        <TriangleAlert className="ic warn-ic" aria-hidden />
      ) : (
        <span className={`end ${end.tone} tnum`}>{end.text}</span>
      )}
    </div>
  );
}

export function Ready({
  state,
  offline,
  busy,
  onTitle,
  onGoLive,
  onBlocked,
}: {
  state: DeckState;
  offline: boolean;
  busy: boolean;
  onTitle: () => void;
  onGoLive: () => void;
  onBlocked: (why: string) => void;
}) {
  const { t } = useI18n();
  const starting = state.live.state === "starting" || busy;
  const { platforms, total } = state.ready;
  const names = [
    ...new Set(state.targets.map((target) => platformLabel(target.platform))),
  ];
  const protections = [
    [state.protections.brb, t("deck.health.protect.brb")],
    [state.protections.autoBitrate, t("deck.health.protect.autoBitrate")],
    [state.protections.blackScreen, t("deck.health.protect.blackScreen")],
  ] as const;
  const armed = protections.filter(([on]) => on).map(([, name]) => name);
  const blocked = offline
    ? t("deck.link.offToast")
    : platforms === 0
      ? t("deck.ready.noPlatforms")
      : undefined;
  const hold = useHold<HTMLButtonElement>(
    GO_LIVE_HOLD_MS,
    onGoLive,
    () => onBlocked(t("deck.ready.holdHint")),
    !!blocked || starting,
  );
  const mic = state.obs.mic;
  const hintId = useId();
  return (
    <>
      <div className="ready-head">
        <h2>
          {starting ? t("deck.ready.startingTitle") : t("deck.ready.title")}
        </h2>
        <p>{starting ? t("deck.ready.startingLede") : t("deck.ready.lede")}</p>
      </div>
      {state.live.state === "error" && state.live.message && (
        <div className="alert bad" role="alert">
          <TriangleAlert className="ic" aria-hidden />
          <div className="txt">
            <b>{t("deck.ready.errorTitle")}</b>
            <p>{state.live.message}</p>
          </div>
        </div>
      )}
      <div className="group">
        <ReadyRow
          icon={<TvMinimal className="ic" aria-hidden />}
          title={t("deck.ready.platforms")}
          detail={total ? names.join(" · ") : t("deck.ready.platformsNone")}
          end={
            total
              ? {
                  kind: "text",
                  text: t("deck.ready.count", { n: platforms, total }),
                  tone: platforms === total ? "ok" : "warn",
                }
              : { kind: "warn" }
          }
        />
        <ReadyRow
          icon={<Plug className="ic" aria-hidden />}
          title={t("deck.ready.obs")}
          detail={
            state.obs.connected
              ? state.obs.scene
                ? t("deck.ready.obsScene", { scene: state.obs.scene })
                : t("deck.ready.obsOn")
              : t("deck.ready.obsOff")
          }
          end={state.obs.connected ? { kind: "check" } : { kind: "warn" }}
        />
        {state.obs.connected && (
          <ReadyRow
            icon={<MicVocal className="ic" aria-hidden />}
            title={t("deck.ready.mic")}
            detail={
              mic
                ? mic.muted
                  ? t("deck.ready.micMuted", { name: mic.name })
                  : mic.name
                : t("deck.key.mic.none")
            }
            end={mic && !mic.muted ? { kind: "check" } : { kind: "warn" }}
          />
        )}
        <ReadyRow
          icon={<Shield className="ic" aria-hidden />}
          title={t("deck.ready.protections")}
          detail={
            armed.length ? armed.join(" · ") : t("deck.ready.protectionsNone")
          }
          end={{
            kind: "text",
            text: t("deck.ready.count", {
              n: armed.length,
              total: protections.length,
            }),
            tone: armed.length ? "ok" : "faint",
          }}
        />
      </div>
      <h3 className="sec">{t("deck.ready.titleSection")}</h3>
      <div className="group">
        <button type="button" className="row" onClick={onTitle}>
          <span className="tile">
            <PenLine className="ic" aria-hidden />
          </span>
          <span className="main">
            <b>{state.title.trim() || t("deck.ready.titleEmpty")}</b>
            <small>{t("deck.ready.titleHint")}</small>
          </span>
          <ChevronRight className="ic chev" aria-hidden />
        </button>
      </div>
      <div className="golive">
        {starting ? (
          <button
            type="button"
            className="btn btn-subtle btn-lg btn-block"
            aria-disabled="true"
          >
            <LoaderCircle className="ic spin" aria-hidden />
            {t("deck.ready.connecting")}
          </button>
        ) : (
          <>
            <button
              type="button"
              ref={hold.ref}
              className={`btn btn-tomato btn-lg btn-block ${hold.holding ? "holding" : ""}`}
              aria-disabled={blocked ? true : undefined}
              aria-describedby={hintId}
              {...hold.handlers}
              onClick={() => blocked && onBlocked(blocked)}
            >
              <span className="fill" />
              <span className="lbl">
                <Radio className="ic" aria-hidden />
                {hold.holding ? t("deck.key.holding") : t("deck.ready.goLive")}
              </span>
            </button>
            <p className="fine" id={hintId}>
              {blocked ?? t("deck.ready.goLiveHint")}
            </p>
          </>
        )}
      </div>
    </>
  );
}
