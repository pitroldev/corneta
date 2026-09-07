import type { Locale } from "./i18n/locale";
import type { ReportSummaryResult } from "./reportTasks";

interface SummaryQueue {
  ids: readonly string[];
  locale: Locale;
  read: (id: string) => Promise<ArrayBuffer>;
  client: {
    run: (task: {
      kind: "summary";
      raw: ArrayBuffer;
      locale: Locale;
    }) => Promise<ReportSummaryResult | null>;
    dispose: () => void;
  };
  receive: (id: string, result: ReportSummaryResult | null) => void;
}

/** Hold at most one input; cancellation prevents the next disk read. */
export function startReportSummaryQueue({
  ids,
  locale,
  read,
  client,
  receive,
}: SummaryQueue) {
  let cancelled = false;
  const done = (async () => {
    for (const id of ids) {
      if (cancelled) return;
      let result: ReportSummaryResult | null = null;
      try {
        const raw = await read(id);
        if (cancelled) return;
        result = await client.run({ kind: "summary", raw, locale });
      } catch {
        // One unreadable report must not block the rest of the library.
      }
      if (cancelled) return;
      receive(id, result);
    }
  })();
  return {
    done,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      client.dispose();
    },
  };
}
