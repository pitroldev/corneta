import { create } from "zustand";
import { api, IS_TAURI, START_CANCELLED } from "./api";
import * as cfgOps from "./configOps";
import { createChatSlice } from "./store/chat";
import { createNavigationSlice } from "./store/navigation";
import { createOauthSlice } from "./store/oauth";
import type { State, T } from "./store/types";
import { addStep, capture } from "./telemetry";
import {
  createTelemetryId,
  fpsBucket,
  isUuid,
  normalizeErrorCode,
  resolutionBucket,
  type SafePlatform,
} from "./telemetry-schema";
import { toast } from "./toast";
import type { AppConfig, EncoderInfo, EngineSnapshot, Target } from "./types";
import { uid } from "./utils";
import { createObsCoordinator, ObsConfigSaveError } from "./obsCoordinator";

let pendingRemoval: { target: Target; index: number } | null = null;

// Share one encoder probe per webview to avoid duplicate FFmpeg processes.
let encoderLoadPromise: Promise<EncoderInfo[]> | null = null;

const EMPTY_SNAPSHOT: EngineSnapshot = {
  state: "stopped",
  startedAt: null,
  ingestLive: false,
  targets: {},
};

export function downTargets(snapshot: EngineSnapshot): number {
  return Object.values(snapshot.targets).filter(
    (t) =>
      t.state === "error" ||
      t.state === "reconnecting" ||
      t.state === "signal-lost",
  ).length;
}

async function readConfig(t: T): Promise<AppConfig> {
  let config = await api.getConfig();
  if (!config.profiles || config.profiles.length === 0) {
    const id = uid("prof");
    config = {
      ...config,
      profiles: [
        {
          id,
          name: t("core.profile.default.name"),
          mode: config.mode,
          targets: config.targets,
        },
      ],
      activeProfileId: id,
    };
    config = await api.saveConfig(config);
  } else if (!config.profiles.some((p) => p.id === config.activeProfileId)) {
    const p = config.profiles[0];
    config = {
      ...config,
      activeProfileId: p.id,
      mode: p.mode,
      targets: p.targets.map((t) => ({ ...t })),
    };
  }
  return config;
}

export const useStore = create<State>((set, get) => {
  // Queue writes immediately and in order; asynchronous beforeunload is not reliable in WebView.
  let saveChain: Promise<void> = Promise.resolve();
  let saveRevision = 0;
  let pendingSaves = 0;
  let saveFailed = false;
  let liveOperation: { id: string } | null = null;
  const flushSave = () => saveChain;
  const persist = (config: AppConfig) => {
    const profiles = config.profiles.map((p) =>
      p.id === config.activeProfileId
        ? { ...p, mode: config.mode, targets: config.targets }
        : p,
    );
    const next = { ...config, profiles };
    set({ config: next });
    pendingSaves += 1;
    saveChain = saveChain
      .catch(() => undefined)
      .then(async () => {
        const saved = await api.saveConfig({ ...next, revision: saveRevision });
        saveFailed = false;
        saveRevision = saved.revision;
        pendingSaves -= 1;
        if (pendingSaves === 0) set({ config: saved });
      })
      .catch((error) => {
        saveFailed = true;
        pendingSaves = Math.max(0, pendingSaves - 1);
        console.error("Failed to save configuration", error);
      });
  };

  const obs = createObsCoordinator({
    async flushSave() {
      // New edits can arrive while awaiting persistence; OBS must see the latest saved value.
      let pending: Promise<void>;
      do {
        pending = saveChain;
        await pending;
      } while (pending !== saveChain);
      if (saveFailed) throw new ObsConfigSaveError();
    },
    configKey() {
      const config = get().config;
      // In-memory only: never log or persist this coordinator key.
      return JSON.stringify([config?.ingest, config?.settings.obsPassword]);
    },
    check: () => api.obsCheck(),
    configure: () => api.obsAutoconfigure(),
  });

  return {
    ...createOauthSlice({ set, get, persist, flushSave }),
    ...createChatSlice({ set, get, persist, flushSave }),
    ...createNavigationSlice({ set, get, persist, flushSave }),
    loaded: false,
    bootError: null,
    config: null,
    snapshot: EMPTY_SNAPSHOT,
    encoders: [],
    encodersError: false,
    uploadMbps: null,
    lastOperationId: null,
    async load(t) {
      // Encoder probing starts native processes, so keep it off the initial configuration load path.
      set({ bootError: null });
      let config: AppConfig;
      try {
        config = await readConfig(t);
      } catch (error) {
        // Expose config failures and complete loading so the boot screen can offer recovery.
        console.error("Failed to load configuration", error);
        set({ bootError: String(error) });
        return;
      }
      saveRevision = config.revision;
      saveFailed = false;
      set({ config, loaded: true });
      try {
        set({ chatConnected: await api.chatRunning() });
      } catch {
        /* Keep the disconnected default when the backend is unavailable. */
      }
      try {
        const sessions = await api.listSessions(t);
        const newest = sessions[0];
        const seenAt = Number(
          localStorage.getItem("corneta.lastSeenReportAt") || 0,
        );
        if (seenAt === 0) {
          // Existing sessions should not appear unread when the visit timestamp is first introduced.
          localStorage.setItem("corneta.lastSeenReportAt", String(Date.now()));
        } else if (newest && (newest.endedAt ?? newest.startedAt) > seenAt) {
          set({ unseenReport: true });
        }
      } catch {
        /* An empty session directory is valid. */
      }
    },
    bindEngine(t) {
      return api.subscribe((snapshot) => {
        const previousSnapshot = get().snapshot;
        const prev = previousSnapshot.state;
        const operationId = isUuid(snapshot.operationId)
          ? snapshot.operationId
          : liveOperation?.id;
        set({
          snapshot,
          ...(isUuid(operationId) ? { lastOperationId: operationId } : {}),
        });
        if (prev !== "live" && snapshot.state === "live" && operationId)
          addStep("live_became_active", { operation_id: operationId });
        if (
          liveOperation &&
          (snapshot.state === "error" || snapshot.state === "stopped")
        )
          liveOperation = null;
        if (prev !== "live" && snapshot.state === "live") {
          const s = get();
          const st = s.config?.settings;
          const hasSources =
            (st?.chatSources ?? []).some((x) => x.enabled && x.value.trim()) ||
            (st?.alertSources ?? []).some((x) => x.enabled && x.hasToken);
          if ((st?.chatAutoConnect ?? true) && hasSources && !s.chatConnected) {
            s.connectChat(t).catch(() =>
              toast.error(t("core.chat.autoConnect.failed")),
            );
          }
        }
      });
    },
    bindConfigSync() {
      // Apply other-window saves without persisting again to avoid write loops.
      return api.subscribeConfigChanged((config) => {
        saveRevision = Math.max(saveRevision, config.revision);
        if (pendingSaves === 0) {
          saveFailed = false;
          set({ config });
        }
      });
    },
    addTarget(platformId) {
      const config = get().config;
      if (!config) return;
      const { config: next, id } = cfgOps.addTarget(config, platformId);
      persist(next);
      return id;
    },
    setPlatforms(ids) {
      const config = get().config;
      if (!config) return;
      persist(cfgOps.syncTargetsToPlatforms(config, ids));
    },
    updateTarget(id, patch) {
      const config = get().config;
      if (!config) return;
      persist(cfgOps.updateTarget(config, id, patch));
    },
    removeTarget(id) {
      const config = get().config;
      if (!config) return;
      const { config: next, removed } = cfgOps.removeTarget(config, id);
      // Keep the vault key so undo can restore the destination completely.
      if (removed) pendingRemoval = removed;
      persist(next);
    },
    toggleTarget(id) {
      const config = get().config;
      if (!config) return;
      persist(cfgOps.toggleTarget(config, id));
    },
    reorderTargets(ordered) {
      const config = get().config;
      if (!config) return;
      persist(cfgOps.reorderTargets(config, ordered));
    },
    duplicateTarget(id) {
      const config = get().config;
      if (!config) return;
      const next = cfgOps.duplicateTarget(config, id, uid("tgt"));
      if (next !== config) persist(next);
    },
    moveTarget(id, dir) {
      const config = get().config;
      if (!config) return;
      const next = cfgOps.moveTarget(config, id, dir);
      if (next !== config) persist(next);
    },
    undoRemoveTarget() {
      const config = get().config;
      if (!config || !pendingRemoval) return;
      const { target, index } = pendingRemoval;
      pendingRemoval = null;
      persist(cfgOps.insertTarget(config, target, index));
    },
    setMode(mode) {
      const config = get().config;
      if (!config) return;
      persist({ ...config, mode });
    },
    setIngest(patch) {
      const config = get().config;
      if (!config) return;
      persist({ ...config, ingest: { ...config.ingest, ...patch } });
    },
    setSettings(patch) {
      const config = get().config;
      if (!config) return;
      persist({ ...config, settings: { ...config.settings, ...patch } });
      if (patch.autostart !== undefined) void api.setAutostart(patch.autostart);
    },
    loadProfile(id) {
      pendingRemoval = null;
      const config = get().config;
      if (!config) return;
      const next = cfgOps.loadProfile(config, id);
      if (next !== config) persist(next);
    },
    addProfile(label) {
      pendingRemoval = null;
      const config = get().config;
      if (!config) return;
      persist(cfgOps.addProfile(config, uid("prof"), label));
    },
    removeProfile(id) {
      pendingRemoval = null;
      const config = get().config;
      if (!config) return;
      const next = cfgOps.removeProfile(config, id);
      if (next !== config) persist(next);
    },
    renameProfile(id, name) {
      const config = get().config;
      if (!config) return;
      persist(cfgOps.renameProfile(config, id, name));
    },
    async setKey(id, key) {
      // Wait for the persisted namespace before writing a newly created destination's vault key.
      await flushSave();
      await api.setKey(id, key);
      get().updateTarget(id, { hasKey: true });
    },
    async clearKey(id) {
      await flushSave();
      await api.clearKey(id);
      get().updateTarget(id, { hasKey: false });
    },
    async refreshEncoders() {
      if (get().encoders.length > 0) return;
      set({ encodersError: false });
      encoderLoadPromise ??= api.detectEncoders();
      try {
        set({ encoders: await encoderLoadPromise });
      } catch (error) {
        console.error("Failed to detect encoders", error);
        set({ encodersError: true });
      } finally {
        encoderLoadPromise = null;
      }
    },
    obs: null,
    async checkObs(force = false) {
      if (force || get().obs === null) set({ obs: "loading" });
      try {
        const r = await obs.check(force);
        set({ obs: r });
        if (force)
          capture("obs_check_completed", {
            outcome: !r.reachable
              ? "not_reachable"
              : r.pointingAtCorneta
                ? "ok"
                : "wrong_destination",
            error_code: r.reachable
              ? r.pointingAtCorneta
                ? "none"
                : "wrong_destination"
              : r.authFailed
                ? "auth_failed"
                : normalizeErrorCode(r.error, "obs_unavailable"),
            resolution_bucket: resolutionBucket(r.width, r.height),
            fps_bucket: fpsBucket(r.fps),
          });
        return r;
      } catch (e) {
        set({
          obs: {
            reachable: false,
            pointingAtCorneta: false,
            width: 0,
            height: 0,
            fps: 0,
            error: String(e),
          },
        });
        if (force)
          capture("obs_check_completed", {
            outcome: "error",
            error_code: normalizeErrorCode(e, "obs_check_failed"),
            resolution_bucket: "unknown",
            fps_bucket: "unknown",
          });
        throw e;
      }
    },
    async runObsCheck(force = false) {
      // Background polls handle errors; explicit checks propagate them after updating shared state.
      await get()
        .checkObs(force)
        .catch(() => {});
    },
    async configureObs() {
      await obs.configure();
      set({ obs: null });
    },
    async runUploadTest() {
      set({ uploadMbps: await api.testUpload() });
    },
    async start() {
      const config = get().config;
      const operation = {
        id: createTelemetryId(),
      };
      liveOperation = operation;
      set({ lastOperationId: operation.id });
      const enabledTargets = (config?.targets ?? []).filter(
        (target) => target.enabled,
      );
      const requestProperties = {
        operation_id: operation.id,
        mode: config?.mode ?? "per-platform",
        target_count: enabledTargets.length,
        platforms: [
          ...new Set(enabledTargets.map((target) => target.platformId)),
        ].sort() as SafePlatform[],
        brb_enabled: config?.settings.brbEnabled ?? false,
        guardian_enabled: config?.settings.guardianEnabled ?? false,
        record_video_enabled: config?.settings.recordVideo ?? false,
      } as const;
      addStep("live_start_requested", {
        operation_id: operation.id,
        stage: "engine_start",
      });
      let requestCaptured = false;
      try {
        await flushSave();
        set({
          leaks: [],
          censored: false,
          viewers: { total: 0, anyLive: false, items: [] },
        });
        // The UI owns request intent before invoke; native code owns subsequent outcomes.
        capture("live_start_requested", requestProperties);
        requestCaptured = true;
        await api.start(operation.id);
      } catch (error) {
        const rustSawOperation =
          IS_TAURI &&
          (error === START_CANCELLED ||
            get().snapshot.operationId === operation.id ||
            String(error).includes(`operation_id: ${operation.id}`));
        if (!rustSawOperation) {
          if (!requestCaptured)
            capture("live_start_requested", requestProperties);
          capture("live_start_failed", {
            operation_id: operation.id,
            stage: "ui_pre_command",
            error_code: normalizeErrorCode(error, "engine_start_failed"),
            cancelled: normalizeErrorCode(error) === "start_cancelled",
          });
        }
        if (liveOperation?.id === operation.id) liveOperation = null;
        throw error;
      }
      if (get().config?.settings.autoStartObs) {
        try {
          await api.obsSetStream(true);
          return "obs-ok";
        } catch {
          return "obs-failed";
        }
      }
      return "manual";
    },
    async stop() {
      await flushSave();
      // Cancelled startup does not produce a completed live report.
      const wasLive = get().snapshot.state === "live";
      const operationId =
        liveOperation?.id ??
        (isUuid(get().snapshot.operationId)
          ? get().snapshot.operationId
          : undefined);
      if (operationId)
        addStep("live_stop_requested", {
          operation_id: operationId,
          stage: "engine_stop",
        });
      if (get().config?.settings.autoStartObs) {
        try {
          await api.obsSetStream(false);
        } catch {
          /* OBS may be unavailable after the native stream has already stopped. */
        }
      }
      await api.stop(operationId);
      if (liveOperation?.id === operationId) liveOperation = null;
      if (wasLive) set({ unseenReport: true });
    },
  };
});
