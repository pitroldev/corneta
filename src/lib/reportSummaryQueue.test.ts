import { describe, expect, it, vi } from "vitest";
import { startReportSummaryQueue } from "./reportSummaryQueue";
import type { ReportSummaryResult } from "./reportTasks";

const result: ReportSummaryResult = {
  complete: true,
  summary: {
    hasData: true,
    peakViewers: 10,
    avgViewers: 5,
    chatTotal: 12,
    problemWindows: 0,
    verdictTone: "ok",
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("report library priority", () => {
  it("stops before analysis and the next read when cancelled during disk I/O", async () => {
    const input = deferred<ArrayBuffer>();
    const read = vi.fn(() => input.promise);
    const client = { run: vi.fn(async () => result), dispose: vi.fn() };
    const receive = vi.fn();
    const queue = startReportSummaryQueue({
      ids: ["a", "b"],
      locale: "pt-BR",
      read,
      client,
      receive,
    });
    queue.cancel();
    queue.cancel();
    input.resolve(new ArrayBuffer(1));
    await queue.done;
    expect(read).toHaveBeenCalledTimes(1);
    expect(client.run).not.toHaveBeenCalled();
    expect(receive).not.toHaveBeenCalled();
    expect(client.dispose).toHaveBeenCalledTimes(1);
  });

  it("ignores an in-flight analysis when detail takes priority; a new queue resumes", async () => {
    const analysis = deferred<ReportSummaryResult>();
    const read = vi.fn(async () => new ArrayBuffer(1));
    const client = { run: vi.fn(() => analysis.promise), dispose: vi.fn() };
    const receive = vi.fn();
    const queue = startReportSummaryQueue({
      ids: ["a", "b"],
      locale: "en",
      read,
      client,
      receive,
    });
    await vi.waitFor(() => expect(client.run).toHaveBeenCalledOnce());
    queue.cancel();
    analysis.resolve(result);
    await queue.done;
    expect(read).toHaveBeenCalledTimes(1);
    expect(receive).not.toHaveBeenCalled();
    const resumed = startReportSummaryQueue({
      ids: ["a", "b"],
      locale: "en",
      read,
      client: { run: async () => result, dispose: vi.fn() },
      receive,
    });
    await resumed.done;
    expect(receive.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
    resumed.cancel();
  });

  it("serializes reads and continues after one damaged session", async () => {
    const read = vi.fn(async (id: string) => {
      if (id === "broken") throw new Error("unreadable");
      return new ArrayBuffer(1);
    });
    const receive = vi.fn();
    const queue = startReportSummaryQueue({
      ids: ["broken", "good"],
      locale: "en",
      read,
      client: { run: async () => result, dispose: vi.fn() },
      receive,
    });
    await queue.done;
    expect(receive.mock.calls).toEqual([
      ["broken", null],
      ["good", result],
    ]);
    queue.cancel();
  });
});
