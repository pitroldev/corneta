import { useCallback, useLayoutEffect, useState } from "react";
import { ReportDetail } from "./reports/ReportDetail";
import { ReportsList } from "./reports/ReportsList";
import { useReportSessions } from "./reports/useReportSessions";

/** Entry point da rota. Dados, lista e narrativa do detalhe vivem em módulos próprios. */
export function ReportsScreen() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { sessions, summaries, error, refresh } = useReportSessions();
  const selectReport = useCallback((id: string) => setSelectedId(id), []);
  const closeReport = useCallback(() => setSelectedId(null), []);
  const handleDeleted = useCallback(() => {
    setSelectedId(null);
    void refresh();
  }, [refresh]);

  // Lista e detalhe compartilham o scroll do shell. Sem este reset, trocar o
  // conteúdo preserva a posição da lista e pode abrir a live no meio da história.
  // O layout effect roda antes do paint, então não há um salto visível do fundo
  // para o topo — inclusive ao voltar ou depois de excluir um relatório.
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
    <ReportsList
      sessions={sessions}
      summaries={summaries}
      error={error}
      onRetry={() => void refresh()}
      onSelect={selectReport}
    />
  );
}
