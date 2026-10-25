import { useId, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Plus,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useI18n } from "../lib/i18n";
import type { DeckCombo, DeckComboAction, DeckComboStep } from "../lib/types";
import { comboSummary, stepIcon, stepText } from "./keys";
import {
  MAX_COMBOS,
  MAX_COMBO_STEPS,
  livePlatforms,
  newComboId,
  stepReady,
  type DeckState,
} from "./model";
import { PlatformGlyph, platformLabel, Sheet } from "./ui";

const STEP_TYPES: DeckComboAction[] = [
  "scene",
  "mark",
  "say",
  "brb",
  "mic",
  "pause",
  "wait",
];

function blankStep(action: DeckComboAction, state: DeckState): DeckComboStep {
  switch (action) {
    case "brb":
      return { action, on: true };
    case "mic":
      return { action, muted: true };
    case "scene":
      return { action, scene: state.obs.scenes[0] ?? "" };
    case "say":
      return { action, text: "" };
    case "pause":
      return { action, platform: livePlatforms(state)[0], paused: true };
    case "wait":
      return { action, seconds: 3 };
    default:
      return { action };
  }
}

function Seg<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; text: ReactNode; name?: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="seg wide" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
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
  );
}

function useTypeName() {
  const { t } = useI18n();
  return (action: DeckComboAction) =>
    ({
      mark: t("deck.combo.type.mark"),
      brb: t("deck.combo.type.brb"),
      mic: t("deck.combo.type.mic"),
      scene: t("deck.combo.type.scene"),
      say: t("deck.combo.type.say"),
      pause: t("deck.combo.type.pause"),
      wait: t("deck.combo.type.wait"),
    })[action];
}

/** The fields one step needs, shown while it is being added. */
function StepForm({
  state,
  step,
  onChange,
  onAdd,
  onCancel,
}: {
  state: DeckState;
  step: DeckComboStep;
  onChange: (next: DeckComboStep) => void;
  onAdd: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const typeName = useTypeName();
  const inputId = useId();
  const Icon = stepIcon(step);
  const ready = stepReady(step);
  const platforms = livePlatforms(state);
  return (
    <div className="step-form">
      <b className="step-form-title">
        <Icon className="ic" aria-hidden />
        {typeName(step.action)}
      </b>
      {step.action === "mark" && (
        <input
          id={inputId}
          className="input"
          value={step.label ?? ""}
          maxLength={40}
          placeholder={t("deck.combo.markLabel")}
          aria-label={t("deck.combo.markLabel")}
          onChange={(e) => onChange({ ...step, label: e.target.value })}
        />
      )}
      {step.action === "brb" && (
        <Seg
          label={typeName("brb")}
          value={step.on ?? true}
          options={[
            { value: true, text: t("deck.combo.brbOn") },
            { value: false, text: t("deck.combo.brbOff") },
          ]}
          onChange={(on) => onChange({ ...step, on })}
        />
      )}
      {step.action === "mic" && (
        <Seg
          label={typeName("mic")}
          value={step.muted ?? true}
          options={[
            { value: true, text: t("deck.combo.micMute") },
            { value: false, text: t("deck.combo.micOpen") },
          ]}
          onChange={(muted) => onChange({ ...step, muted })}
        />
      )}
      {step.action === "scene" &&
        (state.obs.scenes.length ? (
          <div
            className="pick-list"
            role="radiogroup"
            aria-label={typeName("scene")}
          >
            {state.obs.scenes.map((scene) => (
              <button
                key={scene}
                type="button"
                role="radio"
                aria-checked={step.scene === scene}
                className="pick"
                onClick={() => onChange({ ...step, scene })}
              >
                {scene}
              </button>
            ))}
          </div>
        ) : (
          <input
            className="input"
            value={step.scene ?? ""}
            maxLength={200}
            placeholder={t("deck.combo.sceneName")}
            aria-label={t("deck.combo.sceneName")}
            onChange={(e) => onChange({ ...step, scene: e.target.value })}
          />
        ))}
      {step.action === "say" && (
        <>
          <input
            className="input"
            value={step.text ?? ""}
            maxLength={200}
            placeholder={t("deck.chat.placeholder")}
            aria-label={t("deck.chat.message")}
            onChange={(e) => onChange({ ...step, text: e.target.value })}
          />
          {state.chatPlatforms.length > 1 && (
            <Seg
              label={t("deck.chat.to")}
              value={step.platform ?? ""}
              options={[
                {
                  value: "",
                  text: t("deck.chat.toAllShort"),
                  name: t("deck.chat.toAll"),
                },
                ...state.chatPlatforms.map((p) => ({
                  value: p,
                  text: <PlatformGlyph platform={p} size={16} />,
                  name: platformLabel(p),
                })),
              ]}
              onChange={(platform) =>
                onChange({ ...step, platform: platform || undefined })
              }
            />
          )}
        </>
      )}
      {step.action === "pause" &&
        (platforms.length ? (
          <>
            <Seg
              label={t("deck.combo.platform")}
              value={step.platform ?? platforms[0]!}
              options={platforms.map((p) => ({
                value: p,
                text: (
                  <>
                    <PlatformGlyph platform={p} size={15} />
                    {platformLabel(p)}
                  </>
                ),
                name: platformLabel(p),
              }))}
              onChange={(platform) => onChange({ ...step, platform })}
            />
            <Seg
              label={typeName("pause")}
              value={step.paused ?? true}
              options={[
                { value: true, text: t("deck.combo.pause") },
                { value: false, text: t("deck.combo.resume") },
              ]}
              onChange={(paused) => onChange({ ...step, paused })}
            />
          </>
        ) : (
          <p className="fine">{t("deck.catalog.pauseHint")}</p>
        ))}
      {step.action === "wait" && (
        <Seg
          label={typeName("wait")}
          value={step.seconds ?? 3}
          options={[1, 3, 5, 10].map((n) => ({
            value: n,
            text: t("deck.combo.short.wait", { n }),
          }))}
          onChange={(seconds) => onChange({ ...step, seconds })}
        />
      )}
      <div className="inline">
        <button
          type="button"
          className="btn btn-primary"
          aria-disabled={!ready || undefined}
          onClick={() => ready && onAdd()}
          data-on-brass
        >
          <Plus className="ic" aria-hidden />
          {t("deck.combo.addThis")}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t("deck.code.cancel")}
        </button>
      </div>
    </div>
  );
}

export function CombosSheet({
  state,
  onClose,
  onEdit,
}: {
  state: DeckState;
  onClose: () => void;
  onEdit: (id: string | null) => void;
}) {
  const { t } = useI18n();
  return (
    <Sheet title={t("deck.combos.title")} onClose={onClose}>
      <p className="lede">{t("deck.combos.lede")}</p>
      {state.combos.length ? (
        <div className="group spaced">
          {state.combos.map((combo) => (
            <button
              key={combo.id}
              type="button"
              className="row"
              onClick={() => onEdit(combo.id)}
            >
              <span className="tile">
                <Zap className="ic" aria-hidden />
              </span>
              <span className="main">
                <b>{combo.name}</b>
                <small>{comboSummary(combo, t)}</small>
              </span>
              <ChevronRight className="ic chev" aria-hidden />
            </button>
          ))}
        </div>
      ) : (
        <p className="fine spaced-bottom">{t("deck.combos.empty")}</p>
      )}
      {state.combos.length < MAX_COMBOS ? (
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => onEdit(null)}
          data-on-brass
        >
          <Plus className="ic" aria-hidden />
          {t("deck.combos.new")}
        </button>
      ) : (
        <p className="fine">{t("deck.combos.full", { n: MAX_COMBOS })}</p>
      )}
    </Sheet>
  );
}

/** Builds or edits one combo; it reaches the PC only when saved. */
export function ComboEditor({
  state,
  combo,
  busy,
  onSave,
  onDelete,
  onClose,
}: {
  state: DeckState;
  combo: DeckCombo | null;
  busy: boolean;
  onSave: (combo: DeckCombo) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const typeName = useTypeName();
  const nameId = useId();
  const [name, setName] = useState(combo?.name ?? "");
  const [steps, setSteps] = useState<DeckComboStep[]>(combo?.steps ?? []);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<DeckComboStep | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const valid = name.trim().length > 0 && steps.length > 0 && !busy;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= steps.length) return;
    const next = [...steps];
    [next[from], next[to]] = [next[to]!, next[from]!];
    setSteps(next);
  };

  const save = () => {
    if (!valid) return;
    onSave({ id: combo?.id ?? newComboId(), name: name.trim(), steps });
  };

  return (
    <Sheet
      title={combo ? t("deck.combo.editTitle") : t("deck.combo.newTitle")}
      onClose={onClose}
    >
      <p className="lede">{t("deck.combo.lede")}</p>
      <div className="field">
        <label htmlFor={nameId}>{t("deck.combo.name")}</label>
        <input
          id={nameId}
          className="input"
          value={name}
          maxLength={24}
          placeholder={t("deck.combo.namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <h4 className="prefs-sec">{t("deck.combo.steps")}</h4>
      {steps.length ? (
        <ol className="group steps">
          {steps.map((step, i) => {
            const Icon = stepIcon(step);
            const text = stepText(step, t);
            return (
              <li key={i} className="row step-row">
                <span className="step-n">{i + 1}</span>
                <Icon className="ic step-ic" aria-hidden />
                <span className="main">
                  <b>{text}</b>
                </span>
                <span className="step-tools">
                  <button
                    type="button"
                    className="iconbtn sm"
                    aria-disabled={i === 0 || undefined}
                    aria-label={t("deck.combo.up", { step: text })}
                    onClick={() => move(i, i - 1)}
                  >
                    <ArrowUp className="ic" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="iconbtn sm"
                    aria-disabled={i === steps.length - 1 || undefined}
                    aria-label={t("deck.combo.down", { step: text })}
                    onClick={() => move(i, i + 1)}
                  >
                    <ArrowDown className="ic" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="iconbtn sm"
                    aria-label={t("deck.combo.removeStep", { step: text })}
                    onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                  >
                    <X className="ic" aria-hidden />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="fine spaced-bottom">{t("deck.combo.noSteps")}</p>
      )}

      {draft ? (
        <StepForm
          state={state}
          step={draft}
          onChange={setDraft}
          onAdd={() => {
            setSteps([...steps, draft]);
            setDraft(null);
          }}
          onCancel={() => setDraft(null)}
        />
      ) : picking ? (
        <div className="step-picker">
          {STEP_TYPES.map((action) => {
            const Icon = stepIcon(blankStep(action, state));
            return (
              <button
                key={action}
                type="button"
                className="btn btn-subtle"
                onClick={() => {
                  setDraft(blankStep(action, state));
                  setPicking(false);
                }}
              >
                <Icon className="ic" aria-hidden />
                {typeName(action)}
              </button>
            );
          })}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPicking(false)}
          >
            {t("deck.code.cancel")}
          </button>
        </div>
      ) : steps.length < MAX_COMBO_STEPS ? (
        <button
          type="button"
          className="btn btn-subtle btn-block"
          onClick={() => setPicking(true)}
        >
          <Plus className="ic" aria-hidden />
          {t("deck.combo.addStep")}
        </button>
      ) : (
        <p className="fine">
          {t("deck.combo.fullSteps", { n: MAX_COMBO_STEPS })}
        </p>
      )}

      <div className="actions top-gap">
        <button
          type="button"
          className="btn btn-primary btn-block"
          aria-disabled={!valid || undefined}
          aria-busy={busy || undefined}
          onClick={save}
          data-on-brass
        >
          {t("deck.combo.save")}
        </button>
        {combo && (
          <button
            type="button"
            className={`btn btn-block ${confirmDelete ? "btn-danger" : "btn-ghost"}`}
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                setTimeout(() => setConfirmDelete(false), 4000);
                return;
              }
              onDelete(combo.id);
            }}
          >
            <Trash2 className="ic" aria-hidden />
            {confirmDelete
              ? t("deck.combo.deleteConfirm")
              : t("deck.combo.delete")}
          </button>
        )}
      </div>
    </Sheet>
  );
}
