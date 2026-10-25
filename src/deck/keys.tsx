import {
  CirclePause,
  Clapperboard,
  Coffee,
  Hand,
  MapPin,
  MessageSquareText,
  Mic,
  MicOff,
  Pause,
  PenLine,
  Play,
  Square,
  Timer,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { I18n } from "../lib/i18n";
import type { DeckCombo, DeckComboStep } from "../lib/types";
import { findCombo, hms, type DeckState } from "./model";
import { platformLabel } from "./ui";

export interface KeyContext {
  state: DeckState;
  t: I18n["t"];
}

export interface KeyView {
  icon: LucideIcon;
  label: string;
  sub: string;
  /** brand: the main key; on: a mode that is active; alarm: something is wrong; danger: ends the live. */
  tone?: "brand" | "on" | "alarm" | "danger";
  /** Toggle keys report their state to screen readers. */
  pressed?: boolean;
  /** Milliseconds to hold before it acts. */
  hold?: number;
  /** Why the key cannot act right now. */
  blocked?: string;
}

export const STOP_HOLD_MS = 1500;
export const GO_LIVE_HOLD_MS = 1000;

export function pausePlatform(id: string): string | null {
  return id.startsWith("pause:") ? id.slice(6) : null;
}

/** Paused only when every target of the platform is paused. */
export function platformPaused(state: DeckState, platform: string): boolean {
  const targets = state.targets.filter((t) => t.platform === platform);
  return targets.length > 0 && targets.every((t) => t.state === "paused");
}

function platformOnAir(state: DeckState, platform: string): boolean {
  return state.targets.some(
    (t) =>
      t.platform === platform &&
      ["live", "brb", "paused", "reconnecting"].includes(t.state),
  );
}

export function stepIcon(step: DeckComboStep): LucideIcon {
  switch (step.action) {
    case "mark":
      return MapPin;
    case "brb":
      return Pause;
    case "mic":
      return step.muted ? MicOff : Mic;
    case "scene":
      return Clapperboard;
    case "say":
      return MessageSquareText;
    case "pause":
      return step.paused ? CirclePause : Play;
    case "wait":
      return Timer;
  }
}

/** A step in a full sentence, for the combo editor. */
export function stepText(step: DeckComboStep, t: I18n["t"]): string {
  const platform = step.platform ? platformLabel(step.platform) : "";
  switch (step.action) {
    case "mark":
      return step.label
        ? t("deck.combo.step.markNamed", { label: step.label })
        : t("deck.combo.step.mark");
    case "brb":
      return t(step.on ? "deck.combo.step.brbOn" : "deck.combo.step.brbOff");
    case "mic":
      return t(
        step.muted ? "deck.combo.step.micMute" : "deck.combo.step.micOpen",
      );
    case "scene":
      return t("deck.combo.step.scene", { scene: step.scene ?? "" });
    case "say":
      return platform
        ? t("deck.combo.step.sayOne", { platform, text: step.text ?? "" })
        : t("deck.combo.step.sayAll", { text: step.text ?? "" });
    case "pause":
      return t(
        step.paused ? "deck.combo.step.pause" : "deck.combo.step.resume",
        { platform },
      );
    case "wait":
      return t("deck.combo.step.wait", { n: step.seconds ?? 3 });
  }
}

/** The steps in a few words, for the key and the catalog. */
export function comboSummary(combo: DeckCombo, t: I18n["t"]): string {
  return combo.steps
    .map((step) => {
      switch (step.action) {
        case "mark":
          return t("deck.combo.short.mark");
        case "brb":
          return t(
            step.on ? "deck.combo.short.brbOn" : "deck.combo.short.brbOff",
          );
        case "mic":
          return t(
            step.muted
              ? "deck.combo.short.micMute"
              : "deck.combo.short.micOpen",
          );
        case "scene":
          return step.scene ?? "";
        case "say":
          return t("deck.combo.short.say");
        case "pause":
          return platformLabel(step.platform ?? "");
        case "wait":
          return t("deck.combo.short.wait", { n: step.seconds ?? 3 });
      }
    })
    .join(" · ");
}

export function keyView(id: string, { state, t }: KeyContext): KeyView {
  const combo = findCombo(id, state);
  if (combo)
    return { icon: Zap, label: combo.name, sub: comboSummary(combo, t) };
  const obs = state.obs;
  const obsBlocked = obs.connected ? undefined : t("deck.key.obsOff");
  const platform = pausePlatform(id);
  if (platform) {
    const paused = platformPaused(state, platform);
    const name = platformLabel(platform);
    return {
      icon: paused ? Play : CirclePause,
      label: t(paused ? "deck.key.resume" : "deck.key.pause", {
        platform: name,
      }),
      sub: t(paused ? "deck.key.pause.subPaused" : "deck.key.pause.sub"),
      tone: paused ? "on" : undefined,
      pressed: paused,
      blocked: platformOnAir(state, platform)
        ? undefined
        : t("deck.key.pause.blocked", { platform: name }),
    };
  }
  switch (id) {
    case "mark": {
      const marks = state.session.marks;
      const last = marks[marks.length - 1];
      return {
        icon: MapPin,
        label: t("deck.key.mark"),
        sub: last
          ? last.label
            ? t("deck.key.mark.lastLabel", {
                at: hms(last.at),
                label: last.label,
              })
            : t("deck.key.mark.last", { at: hms(last.at) })
          : t("deck.key.mark.sub"),
        tone: "brand",
      };
    }
    case "brb": {
      const on = state.live.forcedBrb;
      return {
        icon: Pause,
        label: t("deck.key.brb"),
        sub: t(on ? "deck.key.brb.subOn" : "deck.key.brb.sub"),
        tone: on ? "on" : undefined,
        pressed: on,
      };
    }
    case "mic": {
      const muted = obs.mic?.muted ?? false;
      return {
        icon: muted ? MicOff : Mic,
        label: t(muted ? "deck.key.mic.muted" : "deck.key.mic"),
        sub:
          obsBlocked ??
          (obs.mic
            ? t(muted ? "deck.key.mic.subMuted" : "deck.key.mic.sub")
            : t("deck.key.mic.none")),
        tone: muted ? "alarm" : undefined,
        pressed: muted,
        blocked: obsBlocked ?? (obs.mic ? undefined : t("deck.key.mic.none")),
      };
    }
    case "scene":
      return {
        icon: Clapperboard,
        label: t("deck.key.scene"),
        sub:
          obsBlocked ??
          (obs.scene
            ? t("deck.key.scene.sub", { scene: obs.scene })
            : t("deck.key.scene.pick")),
        blocked: obsBlocked,
      };
    case "title":
      return {
        icon: PenLine,
        label: t("deck.key.title"),
        sub: t("deck.key.title.sub"),
      };
    case "say":
      return {
        icon: MessageSquareText,
        label: t("deck.key.say"),
        sub: state.chatPlatforms.length
          ? t("deck.key.say.sub")
          : t("deck.key.say.none"),
        blocked: state.chatPlatforms.length
          ? undefined
          : t("deck.key.say.none"),
      };
    case "stop":
      return {
        icon: Square,
        label: t("deck.key.stop"),
        sub: t("deck.key.stop.sub"),
        tone: "danger",
        hold: STOP_HOLD_MS,
      };
    case "break":
      return {
        icon: Coffee,
        label: t("deck.key.break"),
        sub: t("deck.key.break.sub"),
      };
    case "bye":
      return {
        icon: Hand,
        label: t("deck.key.bye"),
        sub: t("deck.key.bye.sub"),
      };
    default:
      return { icon: Square, label: id, sub: "" };
  }
}

/** What each key does, for the catalog. */
export function keyDescription(id: string, t: I18n["t"]): string {
  const platform = pausePlatform(id);
  if (platform)
    return t("deck.catalog.pause", { platform: platformLabel(platform) });
  switch (id) {
    case "mark":
      return t("deck.catalog.mark");
    case "brb":
      return t("deck.catalog.brb");
    case "mic":
      return t("deck.catalog.mic");
    case "scene":
      return t("deck.catalog.scene");
    case "title":
      return t("deck.catalog.streamInfo");
    case "say":
      return t("deck.catalog.say");
    case "stop":
      return t("deck.catalog.stop");
    case "break":
      return t("deck.catalog.break");
    case "bye":
      return t("deck.catalog.bye");
    default:
      return "";
  }
}
