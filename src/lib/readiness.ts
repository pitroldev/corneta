import type { I18n } from "./i18n";
import { PLATFORMS } from "./platforms";
import { accountProvider } from "../platforms";
import type { EncoderApp, ObsCheck, Target } from "./types";
import { blockingIssueCodes, type TargetIssue } from "./validation";

export interface ReadinessContext {
  /** Automatic YouTube is on and the account is signed in, so start creates the broadcast and its key. */
  youtubeAuto: boolean;
}

export interface PendingTarget {
  target: Target;
  issues: TargetIssue[];
}

export interface Readiness {
  enabled: Target[];
  ready: Target[];
  pending: PendingTarget[];
}

/** Start provisions only the first enabled YouTube target (commands.rs), so only that one skips the key. */
export function youtubeAutoTargetId(
  targets: Target[],
  ctx: ReadinessContext,
): string | null {
  if (!ctx.youtubeAuto) return null;
  return (
    targets.find(
      (t) =>
        t.enabled &&
        accountProvider(PLATFORMS[t.platformId]?.account ?? "")?.connect ===
          "auto-broadcast",
    )?.id ?? null
  );
}

export function targetBlockers(
  target: Target,
  targets: Target[],
  ctx: ReadinessContext,
): TargetIssue[] {
  const issues = blockingIssueCodes(target);
  if (target.id !== youtubeAutoTargetId(targets, ctx)) return issues;
  return issues.filter((issue) => issue !== "noKey");
}

export function readiness(targets: Target[], ctx: ReadinessContext): Readiness {
  const enabled = targets.filter((t) => t.enabled);
  const ready: Target[] = [];
  const pending: PendingTarget[] = [];
  for (const target of enabled) {
    const issues = targetBlockers(target, targets, ctx);
    if (issues.length === 0) ready.push(target);
    else pending.push({ target, issues });
  }
  return { enabled, ready, pending };
}

/**
 * OBS answers and points at Corneta, or cannot answer and the user confirmed pasting the server
 * and key by hand. A reachable OBS that points elsewhere is never ready, whatever was confirmed.
 * Another program cannot be checked at all, so only the user's confirmation counts for it.
 */
export function obsConfigured(
  obs: ObsCheck | "loading" | null,
  manual = false,
  app: EncoderApp = "obs",
): boolean {
  if (app !== "obs") return manual;
  if (obs === null || obs === "loading") return false;
  return obs.reachable ? obs.pointingAtCorneta : manual;
}

/** Names joined as a sentence: "Twitch, YouTube e Kick". */
export function joinNames(names: string[], t: I18n["t"]): string {
  if (names.length <= 1) return names.join("");
  return t("golive.list.join", {
    head: names.slice(0, -1).join(", "),
    last: names[names.length - 1],
  });
}
