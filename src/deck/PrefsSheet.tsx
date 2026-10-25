import { useId, type ReactNode } from "react";
import { MapPin, RotateCcw, Users } from "lucide-react";
import { useI18n } from "../lib/i18n";
import {
  DEFAULT_PREFS,
  type DeckPrefs,
  type Density,
  type Size,
} from "./model";
import { PlatformGlyph, Sheet } from "./ui";

function Switch({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="row switch-row"
      onClick={() => onChange(!checked)}
    >
      <span className="main">
        <b>{label}</b>
        {sub && <small>{sub}</small>}
      </span>
      <span className="switch" aria-hidden>
        <i />
      </span>
    </button>
  );
}

function Choice<T extends string | number>({
  label,
  hint,
  value,
  options,
  onChange,
  children,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; text: string; name: string }[];
  onChange: (next: T) => void;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="row choice">
      <span className="main">
        <b id={id}>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <div className="seg wide" role="radiogroup" aria-labelledby={id}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            aria-label={option.name}
            onClick={() => onChange(option.value)}
          >
            {option.text}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

/** What this phone shows and how big: saved on the phone, so each device can differ. */
export function PrefsSheet({
  prefs,
  samplePlatform,
  onChange,
  onClose,
}: {
  prefs: DeckPrefs;
  /** A platform from this stream, for the chat sample. */
  samplePlatform?: string;
  onChange: (next: DeckPrefs) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const notify = (key: keyof DeckPrefs["notify"]) => (on: boolean) =>
    onChange({ ...prefs, notify: { ...prefs.notify, [key]: on } });
  const sizes: { value: Size; text: string; name: string }[] = [
    {
      value: "s",
      text: t("deck.prefs.size.s"),
      name: t("deck.prefs.size.sName"),
    },
    {
      value: "m",
      text: t("deck.prefs.size.m"),
      name: t("deck.prefs.size.mName"),
    },
    {
      value: "l",
      text: t("deck.prefs.size.l"),
      name: t("deck.prefs.size.lName"),
    },
    {
      value: "xl",
      text: t("deck.prefs.size.xl"),
      name: t("deck.prefs.size.xlName"),
    },
  ];
  const densities: { value: Density; text: string; name: string }[] = [
    {
      value: "compact",
      text: t("deck.prefs.density.compact"),
      name: t("deck.prefs.density.compact"),
    },
    {
      value: "normal",
      text: t("deck.prefs.density.normal"),
      name: t("deck.prefs.density.normal"),
    },
    {
      value: "large",
      text: t("deck.prefs.density.large"),
      name: t("deck.prefs.density.large"),
    },
  ];
  const isDefault = JSON.stringify(prefs) === JSON.stringify(DEFAULT_PREFS);

  return (
    <Sheet title={t("deck.prefs.title")} onClose={onClose}>
      <p className="lede">{t("deck.prefs.lede")}</p>

      <h4 className="prefs-sec">{t("deck.prefs.notify")}</h4>
      <div className="group">
        <Switch
          label={t("deck.prefs.notify.marks")}
          sub={t("deck.prefs.notify.marksHint")}
          checked={prefs.notify.marks}
          onChange={notify("marks")}
        />
        <Switch
          label={t("deck.prefs.notify.actions")}
          sub={t("deck.prefs.notify.actionsHint")}
          checked={prefs.notify.actions}
          onChange={notify("actions")}
        />
        <Switch
          label={t("deck.prefs.notify.mentions")}
          sub={t("deck.prefs.notify.mentionsHint")}
          checked={prefs.notify.mentions}
          onChange={notify("mentions")}
        />
        <Switch
          label={t("deck.prefs.notify.raids")}
          checked={prefs.notify.raids}
          onChange={notify("raids")}
        />
        <Switch
          label={t("deck.prefs.notify.subs")}
          sub={t("deck.prefs.notify.subsHint")}
          checked={prefs.notify.subs}
          onChange={notify("subs")}
        />
        <Switch
          label={t("deck.prefs.notify.money")}
          sub={t("deck.prefs.notify.moneyHint")}
          checked={prefs.notify.money}
          onChange={notify("money")}
        />
        <Switch
          label={t("deck.prefs.notify.micMuted")}
          sub={t("deck.prefs.notify.micMutedHint")}
          checked={prefs.notify.micMuted}
          onChange={notify("micMuted")}
        />
        <Switch
          label={t("deck.prefs.vibrate")}
          sub={t("deck.prefs.vibrateHint")}
          checked={prefs.vibrate}
          onChange={(vibrate) => onChange({ ...prefs, vibrate })}
        />
      </div>
      <div className="group spaced-top">
        <Choice
          label={t("deck.prefs.alertTime")}
          hint={t("deck.prefs.alertTimeHint")}
          value={prefs.alertTime}
          options={[
            {
              value: "short",
              text: t("deck.prefs.alertTime.short"),
              name: t("deck.prefs.alertTime.shortName"),
            },
            {
              value: "normal",
              text: t("deck.prefs.alertTime.normal"),
              name: t("deck.prefs.alertTime.normalName"),
            },
            {
              value: "sticky",
              text: t("deck.prefs.alertTime.sticky"),
              name: t("deck.prefs.alertTime.sticky"),
            },
          ]}
          onChange={(alertTime) => onChange({ ...prefs, alertTime })}
        />
      </div>
      <p className="fine top-gap">{t("deck.prefs.alwaysOn")}</p>

      <h4 className="prefs-sec">{t("deck.prefs.look")}</h4>
      <div className="group">
        <Choice
          label={t("deck.prefs.theme")}
          hint={t("deck.prefs.themeHint")}
          value={prefs.theme}
          options={[
            {
              value: "dark",
              text: t("deck.prefs.theme.dark"),
              name: t("deck.prefs.theme.dark"),
            },
            {
              value: "light",
              text: t("deck.prefs.theme.light"),
              name: t("deck.prefs.theme.light"),
            },
            {
              value: "contrast",
              text: t("deck.prefs.theme.contrast"),
              name: t("deck.prefs.theme.contrastName"),
            },
          ]}
          onChange={(theme) => onChange({ ...prefs, theme })}
        />
        <Choice
          label={t("deck.prefs.hand")}
          hint={t("deck.prefs.handHint")}
          value={prefs.hand}
          options={[
            {
              value: "right",
              text: t("deck.prefs.hand.right"),
              name: t("deck.prefs.hand.right"),
            },
            {
              value: "left",
              text: t("deck.prefs.hand.left"),
              name: t("deck.prefs.hand.left"),
            },
          ]}
          onChange={(hand) => onChange({ ...prefs, hand })}
        />
      </div>

      <h4 className="prefs-sec">{t("deck.prefs.size")}</h4>
      <div className="group">
        <Choice
          label={t("deck.prefs.ui")}
          hint={t("deck.prefs.uiHint")}
          value={prefs.ui}
          options={sizes}
          onChange={(ui) => onChange({ ...prefs, ui })}
        />
        <Choice
          label={t("deck.prefs.keys")}
          hint={t("deck.prefs.keysHint")}
          value={prefs.keys}
          options={densities}
          onChange={(keys) => onChange({ ...prefs, keys })}
        />
        <Choice
          label={t("deck.prefs.columns")}
          hint={t("deck.prefs.columnsHint")}
          value={prefs.columns}
          options={[
            {
              value: 2,
              text: "2",
              name: t("deck.prefs.columnsName", { n: 2 }),
            },
            {
              value: 3,
              text: "3",
              name: t("deck.prefs.columnsName", { n: 3 }),
            },
          ]}
          onChange={(columns) => onChange({ ...prefs, columns })}
        />
        <Choice
          label={t("deck.prefs.chat")}
          value={prefs.chat}
          options={sizes}
          onChange={(chat) => onChange({ ...prefs, chat })}
        >
          <p className="msg sample-msg" aria-hidden>
            {samplePlatform && (
              <PlatformGlyph platform={samplePlatform} size={13} />
            )}
            <span className="who" style={{ color: "#ff7ad9" }}>
              Lu_zinha
            </span>
            <span className="txt">{t("deck.prefs.chatSample")}</span>
          </p>
        </Choice>
        <Choice
          label={t("deck.prefs.alerts")}
          value={prefs.alerts}
          options={densities}
          onChange={(alerts) => onChange({ ...prefs, alerts })}
        >
          <div className="alert brass sample-alert" aria-hidden>
            <Users className="ic" />
            <div className="txt">
              <b>{t("deck.prefs.alertSample")}</b>
              <p>{t("deck.prefs.alertSampleBody")}</p>
              <div className="acts">
                <span className="btn btn-subtle btn-sm">
                  <MapPin className="ic" />
                  {t("deck.event.markRaid")}
                </span>
              </div>
            </div>
          </div>
        </Choice>
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-block prefs-reset"
        onClick={() => onChange(DEFAULT_PREFS)}
        aria-disabled={isDefault || undefined}
      >
        <RotateCcw className="ic" aria-hidden />
        {t("deck.prefs.reset")}
      </button>
    </Sheet>
  );
}
