import { useI18n } from "../../lib/i18n";
import type { ReplayStartupDiagnostic } from "./startupDiagnostics";

export function ReplayLoadingDetails({
  diagnostic,
}: {
  diagnostic?: ReplayStartupDiagnostic;
}) {
  const { t, fmt } = useI18n();
  if (!diagnostic) return null;
  const transport = diagnostic.transport;
  return (
    <details className="border-t border-border-soft bg-surface px-4 py-2 text-xs text-ink-muted">
      <summary className="cursor-pointer font-semibold hover:text-brass">
        {t("replay.diagnostics")}
      </summary>
      <div className="mt-2 space-y-1 tabular-nums">
        {diagnostic.metadataMs != null && (
          <p>
            {t("replay.diagnostics.metadata", {
              ms: fmt.num(diagnostic.metadataMs),
            })}
          </p>
        )}
        <p>
          {t(
            diagnostic.firstFrameMs == null
              ? "replay.diagnostics.noFrame"
              : "replay.diagnostics.frame",
            { ms: fmt.num(diagnostic.firstFrameMs ?? diagnostic.elapsedMs) },
          )}
        </p>
        {transport && (
          <>
            <p>
              {t("replay.diagnostics.transport", {
                read: fmt.dec(transport.bytesRead / 1024 ** 2, 1),
                total: fmt.dec(transport.fileBytes / 1024 ** 3, 1),
                ranges: fmt.num(transport.rangeRequests),
                requests: fmt.num(transport.requests),
              })}
            </p>
            <p>
              {t("replay.diagnostics.buffer", {
                size: fmt.dec(transport.peakBufferedBytes / 1024, 0),
              })}
            </p>
            {transport.nativeProcessMemoryBytes != null && (
              <p>
                {t("replay.diagnostics.processMemory", {
                  size: fmt.dec(
                    transport.nativeProcessMemoryBytes / 1024 ** 2,
                    1,
                  ),
                })}
              </p>
            )}
          </>
        )}
        <p>{t("replay.diagnostics.local")}</p>
      </div>
    </details>
  );
}
