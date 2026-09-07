import type { ObsCheck } from "./types";

export class ObsConfigSaveError extends Error {
  constructor() {
    super("corneta:obs-config-save-failed");
  }
}

export class ObsConfigChangedError extends Error {
  constructor() {
    super("corneta:obs-config-changed");
  }
}

/** One OBS query at a time; each result belongs to its requesting configuration. */
export function createObsCoordinator(deps: {
  flushSave: () => Promise<void>;
  configKey: () => string;
  check: () => Promise<ObsCheck>;
  configure: () => Promise<void>;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  let cached: { key: string; at: number; result: ObsCheck } | null = null;
  let checking: Promise<ObsCheck> | null = null;
  let configuring: Promise<void> | null = null;

  const check = (force = false): Promise<ObsCheck> => {
    if (configuring) return configuring.then(() => check(force));
    if (checking) return checking;
    const task = (async () => {
      for (;;) {
        await deps.flushSave();
        const key = deps.configKey();
        if (!force && cached?.key === key && now() - cached.at < 5000)
          return cached.result;
        let result: ObsCheck;
        try {
          result = await deps.check();
        } catch (error) {
          if (key !== deps.configKey()) continue;
          throw error;
        }
        // Never publish a verdict for settings changed during the query.
        if (key !== deps.configKey()) continue;
        cached = { key, at: now(), result };
        return result;
      }
    })();
    checking = task;
    void task
      .finally(() => {
        if (checking === task) checking = null;
      })
      .catch(() => {});
    return task;
  };

  const configure = (): Promise<void> => {
    if (configuring) return configuring;
    const previousCheck = checking;
    const task = (async () => {
      // Do not configure OBS concurrently with an older query.
      await previousCheck?.catch(() => {});
      await deps.flushSave();
      const key = deps.configKey();
      try {
        await deps.configure();
      } finally {
        cached = null;
      }
      if (key !== deps.configKey()) throw new ObsConfigChangedError();
    })();
    configuring = task;
    void task
      .finally(() => {
        if (configuring === task) configuring = null;
      })
      .catch(() => {});
    return task;
  };

  return { check, configure };
}
