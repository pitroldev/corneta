import type { CornetaApi, RecordingReplayStatus } from "../../lib/api/types";

export interface ReplaySourceState {
  url?: string;
  status?: RecordingReplayStatus;
  sourceError: boolean;
  openingStartedAt?: number;
  openingSlow?: boolean;
}

type ReplaySourceApi = Pick<
  CornetaApi,
  | "recordVideoUrl"
  | "releaseRecordVideo"
  | "recordingReplayStatus"
  | "prepareRecordingReplay"
>;

export function createReplaySourceSession(
  api: ReplaySourceApi,
  id: string,
  path: string,
  publish: (state: ReplaySourceState) => void,
  detach: (preservePosition: boolean) => void,
) {
  let active = true;
  let state: ReplaySourceState = { sourceError: false };
  let sourceGeneration = 0;
  let statusGeneration = 0;
  let poll: ReturnType<typeof setTimeout> | undefined;
  let pollErrors = 0;
  const openings = new Set<Promise<void>>();
  let preparingRequest = false;
  let openingTimeout: ReturnType<typeof setTimeout> | undefined;

  const update = (patch: Partial<ReplaySourceState>) => {
    state = { ...state, ...patch };
    if (active) publish(state);
  };

  const release = (url: string) => api.releaseRecordVideo(url).catch(() => {});

  const clearSource = async (
    preservePosition = true,
    waitForPending = false,
  ) => {
    sourceGeneration++;
    clearTimeout(openingTimeout);
    const pendingOpenings = waitForPending ? [...openings] : [];
    const url = state.url;
    detach(preservePosition);
    update({
      url: undefined,
      sourceError: false,
      openingStartedAt: undefined,
      openingSlow: false,
    });
    if (url) await release(url);
    if (waitForPending) await Promise.all(pendingOpenings);
  };

  const open = async () => {
    const generation = ++sourceGeneration;
    clearTimeout(openingTimeout);
    update({
      openingStartedAt: performance.now(),
      openingSlow: false,
      sourceError: false,
    });
    const timeout = setTimeout(() => {
      if (active && generation === sourceGeneration)
        update({ openingSlow: true });
    }, 12_000);
    openingTimeout = timeout;
    try {
      const url = await api.recordVideoUrl(path);
      if (!active || generation !== sourceGeneration) {
        await release(url);
        return;
      }
      update({ url, sourceError: false, openingSlow: false });
    } catch {
      if (active && generation === sourceGeneration)
        update({ sourceError: true, openingSlow: false });
    } finally {
      clearTimeout(timeout);
    }
  };

  const requestOpen = () => {
    const opening = open();
    openings.add(opening);
    void opening.finally(() => openings.delete(opening));
  };

  const acceptStatus = (
    status: RecordingReplayStatus,
    refreshSource = false,
  ) => {
    const wasPreparing = state.status?.state === "preparing";
    const becamePrepared =
      status.state === "ready" &&
      (state.status?.state === "unprepared" ||
        state.status?.state === "failed");
    update({ status });
    clearTimeout(poll);
    if (status.state === "preparing") {
      if (!wasPreparing) void clearSource();
      poll = setTimeout(() => void checkStatus(), 2000);
    } else if (status.state === "missing") {
      void clearSource(false);
    } else if (wasPreparing) {
      requestOpen();
    } else if (refreshSource || becamePrepared) {
      const cleared = clearSource();
      const generation = sourceGeneration;
      void cleared.then(() => {
        if (
          active &&
          generation === sourceGeneration &&
          state.status?.state !== "preparing" &&
          state.status?.state !== "missing"
        )
          requestOpen();
      });
    }
  };

  const checkStatus = async (refreshSource = false) => {
    if (preparingRequest) return;
    const generation = ++statusGeneration;
    try {
      const status = await api.recordingReplayStatus(id, path);
      if (!active || generation !== statusGeneration) return;
      pollErrors = 0;
      acceptStatus(status, refreshSource);
    } catch {
      if (!active || generation !== statusGeneration) return;
      if (state.status?.state === "preparing" && ++pollErrors < 3) {
        poll = setTimeout(() => void checkStatus(), 2000);
      } else {
        acceptStatus({ state: "failed", reason: "status_unavailable" });
      }
    }
  };

  requestOpen();
  void checkStatus();

  return {
    refreshStatus(refreshSource = false) {
      if (active) void checkStatus(refreshSource);
    },
    async retry() {
      if (!active || state.status?.state === "preparing") return;
      await clearSource();
      if (!active) return;
      requestOpen();
      void checkStatus();
    },
    async prepare() {
      if (!active || state.status?.state === "preparing") return;
      clearTimeout(poll);
      const generation = ++statusGeneration;
      preparingRequest = true;
      update({ status: { state: "preparing" } });
      await clearSource(true, true);
      if (!active) return;
      try {
        const status = await api.prepareRecordingReplay(id, path);
        preparingRequest = false;
        if (active && generation === statusGeneration) acceptStatus(status);
      } catch {
        preparingRequest = false;
        if (active && generation === statusGeneration) {
          acceptStatus({ state: "failed", reason: "request_failed" });
        }
      }
    },
    dispose() {
      active = false;
      statusGeneration++;
      clearTimeout(poll);
      void clearSource(false);
    },
  };
}
