export interface PlaybackSource {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number | null;
}

/** Only time-sensitive consumers subscribe; the report itself never ticks. */
export function createPlaybackClock() {
  let timestamp: number | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => timestamp,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (value: number | null) => {
      const next = value != null && Number.isFinite(value) ? value : null;
      if (next === timestamp) return;
      timestamp = next;
      for (const listener of listeners) listener();
    },
  };
}
