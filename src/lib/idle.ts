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

/** Schedule non-critical work after first paint, with a deterministic WebView fallback. */
export function runWhenIdle(task: () => void, timeout = 1500): () => void {
  const idleWindow = window as IdleCapableWindow;
  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(task, { timeout });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(task, Math.min(timeout, 250));
  return () => window.clearTimeout(handle);
}
