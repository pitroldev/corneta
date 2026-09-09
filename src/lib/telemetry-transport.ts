import type { QueuedRequestWithOptions } from "posthog-js/dist/module.no-external";

export const SUPPORTED_POSTHOG_TRANSPORT_VERSION = "1.409.5";
const REQUEST_TIMEOUT_MS = 1_000;

export interface TelemetryTransport {
  close(): void;
}

interface CompatibleSdk {
  version: string;
  config: { request_batching: boolean };
  _send_request(options: QueuedRequestWithOptions): void;
  _send_retriable_request(options: QueuedRequestWithOptions): void;
  _retryQueue: { readonly length: number; unload(): void };
  shutdown(): Promise<void> | void;
}

const transports = new WeakMap<object, TelemetryTransport>();

function compatibleSdk(value: unknown): value is CompatibleSdk {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CompatibleSdk>;
  return (
    candidate.version === SUPPORTED_POSTHOG_TRANSPORT_VERSION &&
    candidate.config?.request_batching === false &&
    typeof candidate._send_request === "function" &&
    typeof candidate._send_retriable_request === "function" &&
    candidate._retryQueue?.length === 0 &&
    typeof candidate._retryQueue.unload === "function" &&
    typeof candidate.shutdown === "function"
  );
}

function poisonSdk(instance: unknown): void {
  if (!instance || typeof instance !== "object") return;
  for (const method of ["_send_request", "_send_retriable_request"]) {
    try {
      Reflect.set(instance, method, () => undefined);
    } catch {
      // Incompatible immutable instances must never be returned to a caller for capture.
    }
  }
}

/** Install before capture; close before opt-out/reset. An in-flight request cannot be recalled. */
export function createTelemetryTransport(
  instance: unknown,
): TelemetryTransport {
  if (instance && typeof instance === "object") {
    const existing = transports.get(instance);
    if (existing) return existing;
  }
  if (!compatibleSdk(instance)) {
    poisonSdk(instance);
    throw new Error("telemetry_transport_incompatible_sdk");
  }

  const originalSend = instance._send_request;
  const retryQueue = instance._retryQueue;
  let closed = true;
  const sendOnce = (options: QueuedRequestWithOptions): void => {
    if (closed) return;
    const timeout =
      typeof options.timeout === "number" &&
      Number.isFinite(options.timeout) &&
      options.timeout > 0
        ? Math.min(options.timeout, REQUEST_TIMEOUT_MS)
        : REQUEST_TIMEOUT_MS;
    originalSend.call(instance, {
      ...options,
      timeout,
      // Async gzip could dispatch after close; beacon has unbounded browser-owned delivery.
      compression: undefined,
      transport: options.transport === "XHR" ? "XHR" : "fetch",
      disableTransport: [...(options.disableTransport ?? []), "sendBeacon"],
    });
  };

  // The SDK retries serialized requests without before_send; bypass that queue entirely.
  try {
    instance._send_request = sendOnce;
    instance._send_retriable_request = sendOnce;
  } catch {
    poisonSdk(instance);
    throw new Error("telemetry_transport_incompatible_sdk");
  }
  closed = false;
  const transport = {
    close(): void {
      if (closed) return;
      closed = true;
      try {
        // unload removes listeners/timers; the closed gate blocks any unexpected queued payload.
        retryQueue.unload();
      } catch {
        // Cleanup failure must never reopen the transport.
      }
      try {
        // Shutdown flushes SDK queues; the closed send gate turns those attempts into discards.
        void Promise.resolve(instance.shutdown()).catch(() => undefined);
      } catch {
        // Keep retirement independent of SDK cleanup failures.
      }
    },
  };
  transports.set(instance, transport);
  return transport;
}
