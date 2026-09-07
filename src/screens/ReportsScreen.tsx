import { useCallback, useLayoutEffect, useState } from "react";
import { ReportLibraryCache } from "../lib/reportLibraryCache";
import { ReportDetail } from "./reports/ReportDetail";
import { ReportsList } from "./reports/ReportsList";
import { useReportSessions } from "./reports/useReportSessions";
import { useReportSummaries } from "./reports/useReportSummaries";
import type { ComponentProps } from "react";

function ReportLibrary({
  cache,
  ...props
}: Omit<ComponentProps<typeof ReportsList>, "summaries"> & {
  cache: ReportLibraryCache;
}) {
  const summaries = useReportSummaries(props.sessions, cache);
  return <ReportsList {...props} summaries={summaries} />;
}

export function ReportsScreen() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summaryCache] = useState(() => new ReportLibraryCache());
  const { sessions, error, refresh } = useReportSessions();
  const selectReport = useCallback((id: string) => setSelectedId(id), []);
  const closeReport = useCallback(() => setSelectedId(null), []);
  const handleDeleted = useCallback(() => {
    setSelectedId(null);
    void refresh();
  }, [refresh]);

  // Reset shared shell scroll before painting another report or the list.
  useLayoutEffect(() => {
    const scroller = document.getElementById("screen-scroll");
    if (!scroller) return;
    scroller.scrollTop = 0;
    scroller.scrollLeft = 0;
  }, [selectedId]);

  if (selectedId) {
    const index =
      sessions?.findIndex((session) => session.id === selectedId) ?? -1;
    const previousId = (index >= 0 ? sessions?.[index + 1]?.id : null) ?? null;
    return (
      <ReportDetail
        key={selectedId}
        id={selectedId}
        previousId={previousId}
        onBack={closeReport}
        onDeleted={handleDeleted}
      />
    );
  }

  return (
    <ReportLibrary
      cache={summaryCache}
      sessions={sessions}
      error={error}
      onRetry={() => void refresh()}
      onSelect={selectReport}
    />
  );
}
