import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportClient } from "./reportClient";

class TestWorker {
  static latest: TestWorker;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  messages: { id: number; task: unknown }[] = [];
  stopped = false;
  constructor() {
    TestWorker.latest = this;
  }
  postMessage(
    message: { id: number; task: unknown },
    transfer: Transferable[],
  ) {
    this.messages.push(structuredClone(message, { transfer }));
  }
  terminate() {
    this.stopped = true;
  }
}
afterEach(() => vi.unstubAllGlobals());

describe("report client lifecycle", () => {
  it("transfers binary ownership and rejects pending work on navigation", async () => {
    vi.stubGlobal("Worker", TestWorker);
    const client = new ReportClient();
    const raw = new ArrayBuffer(128);
    const request = client.run({ kind: "summary", raw, locale: "pt-BR" });
    expect(raw.byteLength).toBe(0);
    const cancelled = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    client.dispose();
    await cancelled;
    expect(TestWorker.latest.stopped).toBe(true);
    await expect(
      client.run({ kind: "chatPage", epoch: 0 }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("bounds pending requests and releases a slot when a response arrives", async () => {
    vi.stubGlobal("Worker", TestWorker);
    const client = new ReportClient();
    const requests = Array.from({ length: 4 }, () =>
      client.run({ kind: "chatPage", epoch: 0 }),
    );
    const settled = Promise.allSettled(requests);
    await expect(client.run({ kind: "chatPage", epoch: 0 })).rejects.toThrow(
      "report_queue_full",
    );
    TestWorker.latest.onmessage?.({ data: { id: 1, result: null } });
    await expect(requests[0]).resolves.toBeNull();
    const next = client.run({ kind: "chatPage", epoch: 1 });
    const failed = expect(next).rejects.toThrow("report_worker_failed");
    TestWorker.latest.onerror?.();
    await failed;
    expect(
      (await settled).filter((result) => result.status === "rejected"),
    ).toHaveLength(3);
    expect(TestWorker.latest.stopped).toBe(true);
  });
});
