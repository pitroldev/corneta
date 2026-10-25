import { useState, type FormEvent } from "react";
import {
  Check,
  ChevronRight,
  CirclePause,
  Clapperboard,
  Coffee,
  Flame,
  Handshake,
  Laugh,
  LogOut,
  Play,
  Plus,
  Scissors,
  Settings2,
  Shield,
  SlidersHorizontal,
  Skull,
  Smartphone,
  SunMedium,
  Unlink,
  Wifi,
  Zap,
} from "lucide-react";
import { strong, useI18n } from "../lib/i18n";
import {
  keyDescription,
  keyView,
  platformPaused,
  type KeyContext,
} from "./keys";
import {
  catalog,
  livePlatforms,
  type CatalogGroup,
  type DeckState,
  type DeckTarget,
} from "./model";
import { stateText } from "./parts";
import { PlatformGlyph, platformLabel, Sheet } from "./ui";

export type SheetKind =
  | { kind: "labels" }
  | { kind: "scene" }
  | { kind: "title" }
  | { kind: "say" }
  | { kind: "target"; id: string }
  | { kind: "menu" }
  | { kind: "prefs" }
  | { kind: "combos" }
  | { kind: "combo"; id: string | null; back: "combos" | "catalog" }
  | { kind: "how" }
  | { kind: "catalog" };

const LABELS = [
  { key: "deck.labels.goodPlay", Icon: Flame },
  { key: "deck.labels.fail", Icon: Skull },
  { key: "deck.labels.funny", Icon: Laugh },
  { key: "deck.labels.clip", Icon: Scissors },
  { key: "deck.labels.sponsor", Icon: Handshake },
  { key: "deck.labels.break", Icon: Coffee },
] as const;

export function LabelsSheet({
  onClose,
  onMark,
}: {
  onClose: () => void;
  onMark: (label: string) => void;
}) {
  const { t } = useI18n();
  const [custom, setCustom] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (custom.trim()) onMark(custom.trim());
  };
  return (
    <Sheet title={t("deck.labels.title")} onClose={onClose}>
      <p className="lede">{t("deck.labels.lede")}</p>
      <div className="labels">
        {LABELS.map(({ key, Icon }) => (
          <button
            key={key}
            type="button"
            className="btn btn-subtle"
            onClick={() => onMark(t(key))}
          >
            <Icon className="ic" aria-hidden />
            {t(key)}
          </button>
        ))}
      </div>
      <form className="inline" onSubmit={submit} autoComplete="off">
        <input
          className="input"
          value={custom}
          maxLength={40}
          enterKeyHint="done"
          onChange={(e) => setCustom(e.target.value)}
          placeholder={t("deck.labels.other")}
          aria-label={t("deck.labels.otherLabel")}
        />
        <button
          type="submit"
          className="btn btn-primary"
          aria-disabled={!custom.trim() || undefined}
          data-on-brass
        >
          {t("deck.labels.mark")}
        </button>
      </form>
    </Sheet>
  );
}

export function SceneSheet({
  state,
  onClose,
  onPick,
}: {
  state: DeckState;
  onClose: () => void;
  onPick: (scene: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Sheet title={t("deck.scene.title")} onClose={onClose}>
      <p className="lede">{t("deck.scene.lede")}</p>
      {state.obs.scenes.length ? (
        <div className="group">
          {state.obs.scenes.map((scene) => {
            const current = scene === state.obs.scene;
            return (
              <button
                key={scene}
                type="button"
                className="row"
                aria-current={current || undefined}
                onClick={() => (current ? onClose() : onPick(scene))}
              >
                <span className={`tile ${current ? "on" : ""}`}>
                  <Clapperboard className="ic" aria-hidden />
                </span>
                <span className="main">
                  <b>{scene}</b>
                </span>
                {current ? (
                  <span className="chip live">{t("deck.scene.onAir")}</span>
                ) : (
                  <ChevronRight className="ic chev" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="fine">
          {state.obs.connected ? t("deck.scene.none") : t("deck.key.obsOff")}
        </p>
      )}
    </Sheet>
  );
}

export function TitleSheet({
  state,
  onClose,
  onSave,
}: {
  state: DeckState;
  onClose: () => void;
  onSave: (title: string, game: string) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(state.title);
  const [game, setGame] = useState("");
  const live = state.live.state === "live";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim()) onSave(title.trim(), game.trim());
  };
  return (
    <Sheet title={t("deck.title.title")} onClose={onClose}>
      <p className="lede">{t("deck.title.lede")}</p>
      <form onSubmit={submit} autoComplete="off">
        <div className="field">
          <label htmlFor="deck-title">{t("deck.title.field")}</label>
          <input
            id="deck-title"
            className="input"
            value={title}
            maxLength={140}
            onChange={(e) => setTitle(e.target.value)}
          />
          <span className="count tnum">{title.length}/140</span>
        </div>
        <div className="field">
          <label htmlFor="deck-game">{t("deck.title.game")}</label>
          <input
            id="deck-game"
            className="input"
            value={game}
            maxLength={60}
            placeholder={t("deck.title.gameKeep")}
            onChange={(e) => setGame(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary btn-block"
          aria-disabled={!title.trim() || undefined}
          data-on-brass
        >
          {live ? t("deck.title.saveLive") : t("deck.title.save")}
        </button>
      </form>
    </Sheet>
  );
}

const QUICK = [
  "deck.say.back5",
  "deck.say.welcome",
  "deck.say.thanks",
] as const;

export function SaySheet({
  state,
  onClose,
  onSay,
}: {
  state: DeckState;
  onClose: () => void;
  onSay: (text: string, platform: string) => void;
}) {
  const { t } = useI18n();
  const [platform, setPlatform] = useState("");
  const [text, setText] = useState("");
  const platforms = state.chatPlatforms;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) onSay(text.trim(), platform);
  };
  return (
    <Sheet title={t("deck.say.title")} onClose={onClose}>
      <p className="lede">
        {platform
          ? t("deck.say.ledeOne", { platform: platformLabel(platform) })
          : t("deck.say.lede")}
      </p>
      {platforms.length > 1 && (
        <div
          className="seg wide"
          role="radiogroup"
          aria-label={t("deck.chat.to")}
        >
          {["", ...platforms].map((p) => (
            <button
              key={p || "all"}
              type="button"
              role="radio"
              aria-checked={platform === p}
              onClick={() => setPlatform(p)}
            >
              {p ? <PlatformGlyph platform={p} size={14} /> : null}
              {p ? platformLabel(p) : t("deck.chat.toAll")}
            </button>
          ))}
        </div>
      )}
      <div className="group quick">
        {QUICK.map((key) => (
          <button
            key={key}
            type="button"
            className="row"
            onClick={() => onSay(t(key), platform)}
          >
            <span className="main">
              <b>{t(key)}</b>
            </span>
            <ChevronRight className="ic chev" aria-hidden />
          </button>
        ))}
      </div>
      <form className="inline" onSubmit={submit} autoComplete="off">
        <input
          className="input"
          value={text}
          maxLength={200}
          enterKeyHint="send"
          placeholder={t("deck.chat.placeholder")}
          aria-label={t("deck.chat.message")}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary"
          aria-disabled={!text.trim() || undefined}
          data-on-brass
        >
          {t("deck.chat.send")}
        </button>
      </form>
    </Sheet>
  );
}

export function TargetSheet({
  state,
  target,
  onClose,
  onPause,
}: {
  state: DeckState;
  target: DeckTarget;
  onClose: () => void;
  onPause: (platform: string, paused: boolean) => void;
}) {
  const { t, fmt } = useI18n();
  const live = state.live.state === "live";
  const name = platformLabel(target.platform);
  const on = ["live", "brb", "reconnecting"].includes(target.state);
  const paused = platformPaused(state, target.platform);
  const viewers = state.viewers.items.find(
    (v) => v.platform === target.platform,
  )?.viewers;
  const lede =
    target.state === "paused"
      ? t("deck.target.ledePaused")
      : target.state === "reconnecting"
        ? t("deck.target.ledeReconnecting")
        : target.state === "signal-lost"
          ? t("deck.target.ledeSignal")
          : on
            ? t("deck.target.ledeLive")
            : t("deck.target.ledeOff");
  const twins =
    state.targets.filter((x) => x.platform === target.platform).length > 1;
  return (
    <Sheet
      title={
        <>
          <PlatformGlyph platform={target.platform} size={22} />
          {target.name || name}
        </>
      }
      onClose={onClose}
    >
      <p className="lede">
        <b className={`state-${target.state}`}>{stateText(t, target.state)}.</b>{" "}
        {lede}
      </p>
      <div className="group spaced">
        <div className="row">
          <span className="main">
            <b>{t("deck.target.bitrate")}</b>
          </span>
          <span className="end tnum">
            {on ? fmt.bitrate(target.bitrateKbps) : "—"}
          </span>
        </div>
        <div className="row">
          <span className="main">
            <b>{t("deck.target.fps")}</b>
          </span>
          <span className="end tnum">{on ? target.fps : "—"}</span>
        </div>
        <div className="row">
          <span className="main">
            <b>{t("deck.target.dropped")}</b>
            <small>{t("deck.target.droppedHint")}</small>
          </span>
          <span className="end tnum">{fmt.num(target.dropped)}</span>
        </div>
        <div className="row">
          <span className="main">
            <b>{t("deck.target.viewers")}</b>
          </span>
          <span className="end tnum">
            {on && viewers !== undefined ? fmt.num(viewers) : "—"}
          </span>
        </div>
      </div>
      {live && (on || target.state === "paused") && (
        <>
          <button
            type="button"
            className="btn btn-subtle btn-block"
            onClick={() => onPause(target.platform, !paused)}
          >
            {paused ? (
              <Play className="ic" aria-hidden />
            ) : (
              <CirclePause className="ic" aria-hidden />
            )}
            {paused
              ? t("deck.target.resume", { platform: name })
              : t("deck.target.pause", { platform: name })}
          </button>
          {twins && (
            <p className="fine center">
              {t("deck.target.twins", { platform: name })}
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}

export function MenuSheet({
  state,
  deviceName,
  confirming,
  onClose,
  onEdit,
  onPrefs,
  onCombos,
  onHow,
  onForget,
}: {
  state: DeckState;
  deviceName: string;
  confirming: boolean;
  onClose: () => void;
  onEdit: () => void;
  onPrefs: () => void;
  onCombos: () => void;
  onHow: () => void;
  onForget: () => void;
}) {
  const { t } = useI18n();
  return (
    <Sheet
      title={
        <>
          <Smartphone className="ic" aria-hidden />
          {deviceName}
        </>
      }
      onClose={onClose}
    >
      <p className="lede">
        {strong(t, "deck.menu.connected", { pc: state.pc })}
      </p>
      <div className="group spaced">
        <button type="button" className="row" onClick={onEdit}>
          <span className="tile">
            <SlidersHorizontal className="ic" aria-hidden />
          </span>
          <span className="main">
            <b>{t("deck.menu.edit")}</b>
            <small>{t("deck.menu.editHint")}</small>
          </span>
          <ChevronRight className="ic chev" aria-hidden />
        </button>
        <button type="button" className="row" onClick={onCombos}>
          <span className="tile">
            <Zap className="ic" aria-hidden />
          </span>
          <span className="main">
            <b>{t("deck.menu.combos")}</b>
            <small>{t("deck.menu.combosHint")}</small>
          </span>
          <ChevronRight className="ic chev" aria-hidden />
        </button>
        <button type="button" className="row" onClick={onPrefs}>
          <span className="tile">
            <Settings2 className="ic" aria-hidden />
          </span>
          <span className="main">
            <b>{t("deck.menu.prefs")}</b>
            <small>{t("deck.menu.prefsHint")}</small>
          </span>
          <ChevronRight className="ic chev" aria-hidden />
        </button>
        <button type="button" className="row" onClick={onHow}>
          <span className="tile">
            <Shield className="ic" aria-hidden />
          </span>
          <span className="main">
            <b>{t("deck.menu.how")}</b>
            <small>{t("deck.menu.howHint")}</small>
          </span>
          <ChevronRight className="ic chev" aria-hidden />
        </button>
      </div>
      <button
        type="button"
        className={`btn btn-block ${confirming ? "btn-danger" : "btn-ghost"}`}
        onClick={onForget}
        aria-live="polite"
      >
        <LogOut className="ic" aria-hidden />
        {confirming ? t("deck.menu.forgetConfirm") : t("deck.menu.forget")}
      </button>
    </Sheet>
  );
}

export function HowSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const items = [
    { Icon: Wifi, title: t("deck.how.wifi"), body: t("deck.how.wifiBody") },
    {
      Icon: Shield,
      title: t("deck.how.secrets"),
      body: t("deck.how.secretsBody"),
    },
    {
      Icon: SunMedium,
      title: t("deck.how.screen"),
      body: t("deck.how.screenBody"),
    },
    {
      Icon: Unlink,
      title: t("deck.how.control"),
      body: t("deck.how.controlBody"),
    },
  ];
  return (
    <Sheet title={t("deck.how.title")} onClose={onClose}>
      <p className="lede">{t("deck.how.lede")}</p>
      <ul className="checks">
        {items.map(({ Icon, title, body }) => (
          <li key={title}>
            <span className="tile">
              <Icon className="ic" aria-hidden />
            </span>
            <span>
              <b>{title}</b>
              <small>{body}</small>
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-subtle btn-block"
        onClick={onClose}
      >
        {t("deck.how.ok")}
      </button>
    </Sheet>
  );
}

export function CatalogSheet({
  ctx,
  layout,
  canCreate,
  onCreate,
  onClose,
  onAdd,
}: {
  ctx: KeyContext;
  layout: string[];
  canCreate: boolean;
  onCreate: () => void;
  onClose: () => void;
  onAdd: (id: string) => void;
}) {
  const { t } = useI18n();
  const groups: { id: CatalogGroup; name: string }[] = [
    { id: "live", name: t("deck.catalog.groupLive") },
    { id: "obs", name: t("deck.catalog.groupObs") },
    { id: "chat", name: t("deck.catalog.groupChat") },
    { id: "combos", name: t("deck.catalog.groupCombos") },
  ];
  const items = catalog(ctx.state);
  return (
    <Sheet title={t("deck.catalog.title")} onClose={onClose}>
      <p className="lede">{t("deck.catalog.lede")}</p>
      {groups.map((group) => (
        <div key={group.id} className="cat">
          <h4>{group.name}</h4>
          <div className="group">
            {items
              .filter((item) => item.group === group.id)
              .map(({ id }) => {
                const view = keyView(id, ctx);
                const Icon = view.icon;
                const used = layout.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    className="row"
                    aria-disabled={used || undefined}
                    onClick={() => !used && onAdd(id)}
                  >
                    <span className="tile">
                      <Icon className="ic" aria-hidden />
                    </span>
                    <span className="main">
                      <b>{view.label}</b>
                      <small>
                        {used
                          ? t("deck.catalog.used")
                          : id.startsWith("combo:")
                            ? view.sub
                            : keyDescription(id, t)}
                      </small>
                    </span>
                    {used ? (
                      <Check className="ic check" aria-hidden />
                    ) : (
                      <Plus className="ic chev" aria-hidden />
                    )}
                  </button>
                );
              })}
            {group.id === "combos" && canCreate && (
              <button type="button" className="row" onClick={onCreate}>
                <span className="tile">
                  <Zap className="ic" aria-hidden />
                </span>
                <span className="main">
                  <b>{t("deck.combos.new")}</b>
                  <small>{t("deck.catalog.newCombo")}</small>
                </span>
                <Plus className="ic chev" aria-hidden />
              </button>
            )}
          </div>
        </div>
      ))}
      {livePlatforms(ctx.state).length === 0 && (
        <p className="fine">{t("deck.catalog.pauseHint")}</p>
      )}
    </Sheet>
  );
}
