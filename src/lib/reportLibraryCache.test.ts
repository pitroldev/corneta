import { describe, expect, it, vi } from "vitest";
import { ReportLibraryCache } from "./reportLibraryCache";
import { startReportSummaryQueue } from "./reportSummaryQueue";
import type { SessionSummary } from "./types";

const summary: SessionSummary = {
  hasData: true,
  peakViewers: 10,
  avgViewers: 5,
  chatTotal: 12,
  problemWindows: 0,
  verdictTone: "ok",
};
const sessions = Array.from({ length: 220 }, (_, index) => ({
  id: String(index),
  sourceRevision: "v1",
}));

describe("route-scoped report library cache", () => {
  it("retains every result beyond the persistent cache limit, including null and incomplete reports", () => {
    const cache = new ReportLibraryCache();
    const persisted = vi.fn((id: string) => (Number(id) < 50 ? summary : null));
    expect(cache.prepare(sessions, persisted).missing).toHaveLength(170);
    for (const session of sessions.slice(50))
      cache.remember(session.id, "v1", Number(session.id) % 2 ? summary : null);
    persisted.mockClear();
    const resumed = cache.prepare(sessions, persisted);
    expect(resumed.missing).toEqual([]);
    expect(Object.keys(resumed.summaries)).toHaveLength(220);
    expect(resumed.summaries["50"]).toBeNull();
    expect(resumed.summaries["51"]).toEqual(summary);
    expect(persisted).not.toHaveBeenCalled();
    expect(cache.snapshot(sessions)).toEqual(resumed.summaries);
  });

  it("evicts removed and changed sources and rejects late results for old revisions", () => {
    const cache = new ReportLibraryCache();
    cache.prepare(sessions, () => summary);
    const current = [
      { id: "0", sourceRevision: "v2" },
      { id: "1", sourceRevision: "v1" },
    ];
    expect(cache.prepare(current, () => null)).toEqual({
      summaries: { "1": summary },
      missing: ["0"],
    });
    cache.remember("0", "v1", summary);
    cache.remember("2", "v1", summary);
    expect(cache.snapshot(current)).toEqual({ "1": summary });
    expect(cache.snapshot(sessions)).toEqual({ "1": summary });
    cache.remember("0", "v2", summary);
    expect(cache.prepare(current, () => null).missing).toEqual([]);
  });

  it("resumes only unprocessed sessions after detail cancels the list worker", async () => {
    const cache = new ReportLibraryCache();
    let resolveRead!: (raw: ArrayBuffer) => void;
    const delayedRead = new Promise<ArrayBuffer>((resolve) => {
      resolveRead = resolve;
    });
    const read = vi.fn(async (id: string) =>
      id === "1" ? delayedRead : new ArrayBuffer(1),
    );
    const queue = startReportSummaryQueue({
      ids: cache.prepare(sessions, () => null).missing,
      locale: "en",
      read,
      client: {
        run: async () => ({ complete: false, summary }),
        dispose: vi.fn(),
      },
      receive: (id, result) =>
        cache.remember(id, "v1", result?.summary ?? null),
    });
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    queue.cancel();
    resolveRead(new ArrayBuffer(1));
    await queue.done;
    const resumed = cache.prepare(sessions, () => null);
    expect(resumed.summaries).toEqual({ "0": summary });
    expect(resumed.missing).toEqual(
      sessions.slice(1).map((session) => session.id),
    );
  });
});
