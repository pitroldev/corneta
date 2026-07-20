type IdleCapableWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (
      callback: (deadline: {
        didTimeout: boolean;
        timeRemaining: () => number;
      }) => void,
      options?: { timeout: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

/** Agenda trabalho não crítico depois do primeiro paint, com fallback determinístico no WebView. */
export function runWhenIdle(task: () => void, timeout = 1500): () => void {
  const idleWindow = window as IdleCapableWindow;
  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(task, { timeout });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(task, Math.min(timeout, 250));
  return () => window.clearTimeout(handle);
}
