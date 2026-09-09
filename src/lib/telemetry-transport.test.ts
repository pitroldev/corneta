import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostHog } from "posthog-js/lib/src/posthog-core";
import { RetryQueue } from "posthog-js/lib/src/retry-queue";
import type { QueuedRequestWithOptions } from "posthog-js/dist/module.no-external";
import {
  createTelemetryTransport,
  SUPPORTED_POSTHOG_TRANSPORT_VERSION,
} from "./telemetry-transport";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function sdkHarness() {
  const instance = new PostHog();
  instance.__loaded = true;
  instance.config.request_batching = false;
  instance.config.capture_pageview = false;
  instance.config.capture_pageleave = false;
  instance.config.persistence = "memory";
  instance.config.disable_persistence = true;
  instance._retryQueue = new RetryQueue(instance);
  const requests: QueuedRequestWithOptions[] = [];
  // Exercise the installed SDK core and RetryQueue without invoking any network transport.
  const send = vi
    .spyOn(instance, "_send_request")
    .mockImplementation((options) => requests.push(options));
  return { instance, requests, send, retryQueue: instance._retryQueue };
}

function request(
  overrides: Partial<QueuedRequestWithOptions> = {},
): QueuedRequestWithOptions {
  return {
    url: "https://telemetry.invalid/i/v0/e/",
    method: "POST",
    data: { event: "screen_viewed", properties: { screen_id: "settings" } },
    ...overrides,
  };
}

describe("PostHog single-attempt transport compatibility", () => {
  it("matches the installed SDK version", () => {
    expect(new PostHog().version).toBe(SUPPORTED_POSTHOG_TRANSPORT_VERSION);
  });

  it.each([0, 503])(
    "the unadapted SDK queues status %s for retry",
    (statusCode) => {
      const { instance, requests, retryQueue } = sdkHarness();
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      instance._send_retriable_request(request());
      requests[0].callback?.({ statusCode });
      expect(retryQueue.length).toBe(1);
      retryQueue.unload();
      expect(retryQueue.length).toBe(0);
    },
  );

  it.each([0, 503])(
    "never queues or retries status %s after adaptation",
    (statusCode) => {
      const { instance, requests, retryQueue, send } = sdkHarness();
      const retry = vi.spyOn(retryQueue, "retriableRequest");
      const transport = createTelemetryTransport(instance);
      const callback = vi.fn();
      instance._send_retriable_request(request({ callback }));
      expect(requests).toHaveLength(1);
      requests[0].callback?.({ statusCode });
      expect(callback).toHaveBeenCalledWith({ statusCode });
      expect(retry).not.toHaveBeenCalled();
      expect(retryQueue.length).toBe(0);
      vi.advanceTimersByTime(60 * 60 * 1_000);
      expect(send).toHaveBeenCalledOnce();
      transport.close();
    },
  );

  it("does not let a late failed response retry after close", () => {
    const { instance, requests, send, retryQueue } = sdkHarness();
    const transport = createTelemetryTransport(instance);
    const callback = vi.fn(() => {
      instance._send_retriable_request(request());
    });
    instance._send_retriable_request(request({ callback }));
    const pendingRequest = requests[0];
    transport.close();
    pendingRequest.callback?.({ statusCode: 503 });
    expect(callback).toHaveBeenCalledOnce();
    expect(retryQueue.length).toBe(0);
    vi.advanceTimersByTime(60 * 60 * 1_000);
    expect(send).toHaveBeenCalledOnce();
  });

  it("closes direct and retriable sends before opt-out and unload", () => {
    const { instance, requests, retryQueue, send } = sdkHarness();
    const transport = createTelemetryTransport(instance);
    transport.close();
    instance.opt_out_capturing();
    instance._send_request(request());
    instance._send_retriable_request(request());
    retryQueue.unload();
    vi.advanceTimersByTime(60 * 60 * 1_000);
    expect(requests).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("discards unexpected retry payloads before cleanup can send a beacon", () => {
    const { instance, requests, retryQueue, send } = sdkHarness();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const transport = createTelemetryTransport(instance);
    retryQueue.retriableRequest(request());
    requests[0].callback?.({ statusCode: 503 });
    expect(retryQueue.length).toBe(1);
    transport.close();
    expect(retryQueue.length).toBe(0);
    vi.advanceTimersByTime(60 * 60 * 1_000);
    expect(send).toHaveBeenCalledOnce();
    expect(requests.some((options) => options.transport === "sendBeacon")).toBe(
      false,
    );
  });

  it("never reopens an old instance when a fresh instance is activated", () => {
    const old = sdkHarness();
    const current = sdkHarness();
    const retired = createTelemetryTransport(old.instance);
    retired.close();
    old.instance.opt_in_capturing({ captureEventName: false });
    expect(createTelemetryTransport(old.instance)).toBe(retired);
    const active = createTelemetryTransport(current.instance);
    old.instance._send_retriable_request(request());
    current.instance._send_retriable_request(request());
    expect(old.send).not.toHaveBeenCalled();
    expect(current.send).toHaveBeenCalledOnce();
    active.close();
  });

  it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 60_000])(
    "caps an absent or excessive timeout (%s) at one second",
    (timeout) => {
      const { instance, requests } = sdkHarness();
      const transport = createTelemetryTransport(instance);
      const options = request({ timeout });
      instance._send_request(options);
      expect(requests[0].timeout).toBe(1_000);
      expect(options.timeout).toBe(timeout);
      transport.close();
    },
  );

  it("preserves a shorter timeout and disables deferred compression and beacon delivery", () => {
    const { instance, requests } = sdkHarness();
    const transport = createTelemetryTransport(instance);
    const options = request({
      timeout: 250,
      compression: "best-available",
      transport: "sendBeacon",
      disableTransport: ["XHR"],
    });
    instance._send_request(options);
    expect(requests[0]).toMatchObject({
      timeout: 250,
      compression: undefined,
      transport: "fetch",
      disableTransport: ["XHR", "sendBeacon"],
    });
    expect(options.compression).toBe("best-available");
    expect(options.transport).toBe("sendBeacon");
    expect(options.disableTransport).toEqual(["XHR"]);
    transport.close();
  });

  it("closes idempotently even when SDK cleanup throws", () => {
    const { instance, retryQueue, send } = sdkHarness();
    const unload = vi.spyOn(retryQueue, "unload").mockImplementation(() => {
      throw new Error("synthetic_cleanup_failure");
    });
    const transport = createTelemetryTransport(instance);
    expect(() => transport.close()).not.toThrow();
    transport.close();
    instance._send_request(request());
    expect(unload).toHaveBeenCalledTimes(2);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    null,
    undefined,
    {},
    { version: "1.409.4" },
    { version: "1.409.6" },
  ])("rejects an unsupported SDK before capture (%s)", (instance) => {
    expect(() => createTelemetryTransport(instance)).toThrow(
      "telemetry_transport_incompatible_sdk",
    );
  });

  it.each(["_send_request", "_send_retriable_request"] as const)(
    "rejects a missing %s method",
    (method) => {
      const { instance, send } = sdkHarness();
      Object.defineProperty(instance, method, { value: undefined });
      expect(() => createTelemetryTransport(instance)).toThrow(
        "telemetry_transport_incompatible_sdk",
      );
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("rejects SDK batching rather than creating a second event queue", () => {
    const { instance } = sdkHarness();
    instance.config.request_batching = true;
    expect(() => createTelemetryTransport(instance)).toThrow(
      "telemetry_transport_incompatible_sdk",
    );
  });

  it("rejects installation after a retry has already been queued", () => {
    const { instance, requests, retryQueue } = sdkHarness();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    instance._send_retriable_request(request());
    requests[0].callback?.({ statusCode: 503 });
    expect(() => createTelemetryTransport(instance)).toThrow(
      "telemetry_transport_incompatible_sdk",
    );
    retryQueue.unload();
  });

  it("poisons both send methods when the SDK version is unsupported", () => {
    const { instance, send } = sdkHarness();
    instance.version = "1.409.6";
    expect(() => createTelemetryTransport(instance)).toThrow(
      "telemetry_transport_incompatible_sdk",
    );
    instance._send_request(request());
    instance._send_retriable_request(request());
    expect(send).not.toHaveBeenCalled();
  });

  it("runs SDK shutdown only after closing the send gate", async () => {
    const { instance, send } = sdkHarness();
    const shutdown = vi
      .spyOn(instance, "shutdown")
      .mockImplementation(async () => {
        instance._send_request(request({ transport: "sendBeacon" }));
        throw new Error("synthetic_shutdown_failure");
      });
    const transport = createTelemetryTransport(instance);
    transport.close();
    transport.close();
    await Promise.resolve();
    expect(shutdown).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });
});
