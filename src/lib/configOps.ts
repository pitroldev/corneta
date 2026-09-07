import { makeTarget } from "./factory";
import type { AppConfig, PlatformId, Target } from "./types";

export function suffixName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

const names = (config: AppConfig): Set<string> =>
  new Set(config.targets.map((t) => t.name));

export function addTarget(
  config: AppConfig,
  platformId: PlatformId,
): { config: AppConfig; id: string } {
  const t = makeTarget(platformId);
  t.name = suffixName(t.name, names(config));
  return { config: { ...config, targets: [...config.targets, t] }, id: t.id };
}

/** Preserve destinations with stored keys and never empty the destination list during onboarding. */
export function syncTargetsToPlatforms(
  config: AppConfig,
  selected: PlatformId[],
): AppConfig {
  const want = new Set(selected);
  if (want.size === 0) return config;
  const kept = config.targets.filter((t) => want.has(t.platformId) || t.hasKey);
  const have = new Set(kept.map((t) => t.platformId));
  let next: AppConfig = { ...config, targets: kept };
  for (const id of selected) {
    if (!have.has(id)) next = addTarget(next, id).config;
  }
  return next;
}

export function updateTarget(
  config: AppConfig,
  id: string,
  patch: Partial<Target>,
): AppConfig {
  return {
    ...config,
    targets: config.targets.map((target) => {
      if (target.id !== id) return target;
      const next = { ...target, ...patch };
      // Derive protocol from the URL to keep frontend validation and vault persistence consistent.
      if (patch.ingestUrl !== undefined && patch.protocol === undefined) {
        const scheme = /^rtmps?:\/\//i.exec(patch.ingestUrl.trim())?.[0];
        if (scheme)
          next.protocol = scheme.toLowerCase().startsWith("rtmps")
            ? "rtmps"
            : "rtmp";
      }
      return next;
    }),
  };
}

/** Return the removed target and index so undo can restore its position. */
export function removeTarget(
  config: AppConfig,
  id: string,
): { config: AppConfig; removed: { target: Target; index: number } | null } {
  const index = config.targets.findIndex((t) => t.id === id);
  const target = config.targets[index];
  return {
    config: { ...config, targets: config.targets.filter((t) => t.id !== id) },
    removed: target ? { target, index } : null,
  };
}

export function insertTarget(
  config: AppConfig,
  target: Target,
  index: number,
): AppConfig {
  const targets = [...config.targets];
  targets.splice(Math.min(index, targets.length), 0, target);
  return { ...config, targets };
}

export function toggleTarget(config: AppConfig, id: string): AppConfig {
  return {
    ...config,
    targets: config.targets.map((t) =>
      t.id === id ? { ...t, enabled: !t.enabled } : t,
    ),
  };
}

export function reorderTargets(
  config: AppConfig,
  ordered: Target[],
): AppConfig {
  return { ...config, targets: ordered };
}

/** Duplicate without a stream key; the caller supplies the new ID. */
export function duplicateTarget(
  config: AppConfig,
  id: string,
  newId: string,
): AppConfig {
  const index = config.targets.findIndex((t) => t.id === id);
  const t = config.targets[index];
  if (!t) return config;
  const copy: Target = {
    ...t,
    id: newId,
    name: suffixName(t.name, names(config)),
    hasKey: false,
    encoding: {
      ...t.encoding,
      preset: t.encoding.preset ? { ...t.encoding.preset } : undefined,
    },
  };
  const targets = [...config.targets];
  targets.splice(index + 1, 0, copy);
  return { ...config, targets };
}

export function moveTarget(
  config: AppConfig,
  id: string,
  dir: -1 | 1,
): AppConfig {
  const i = config.targets.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= config.targets.length) return config;
  const targets = [...config.targets];
  [targets[i], targets[j]] = [targets[j], targets[i]];
  return { ...config, targets };
}

export function loadProfile(config: AppConfig, id: string): AppConfig {
  const prof = config.profiles.find((p) => p.id === id);
  if (!prof) return config;
  return {
    ...config,
    activeProfileId: id,
    mode: prof.mode,
    targets: prof.targets.map((t) => ({ ...t })),
  };
}

export function addProfile(
  config: AppConfig,
  id: string,
  label: (n: number) => string,
): AppConfig {
  const taken = new Set(config.profiles.map((p) => p.name));
  let n = config.profiles.length + 1;
  while (taken.has(label(n))) n++;
  const prof = {
    id,
    name: label(n),
    mode: config.mode,
    targets: config.targets.map((t) => ({ ...t })),
  };
  return {
    ...config,
    profiles: [...config.profiles, prof],
    activeProfileId: id,
  };
}

/** Never remove the last profile; removing the active one selects the first remaining profile. */
export function removeProfile(config: AppConfig, id: string): AppConfig {
  if (config.profiles.length <= 1) return config;
  const profiles = config.profiles.filter((p) => p.id !== id);
  if (config.activeProfileId === id) {
    const first = profiles[0];
    return {
      ...config,
      profiles,
      activeProfileId: first.id,
      mode: first.mode,
      targets: first.targets.map((t) => ({ ...t })),
    };
  }
  return { ...config, profiles };
}

export function renameProfile(
  config: AppConfig,
  id: string,
  name: string,
): AppConfig {
  return {
    ...config,
    profiles: config.profiles.map((p) => (p.id === id ? { ...p, name } : p)),
  };
}
