import { ShieldAlert, Shield } from "lucide-react";
import { useT } from "../lib/i18n";
import type { EngineSnapshot } from "../lib/types";

export function GuardianStatus({
  status,
}: {
  status: EngineSnapshot["guardianStatus"];
}) {
  const t = useT();
  if (!status || status === "ready") return null;
  const Icon = status === "unavailable" ? ShieldAlert : Shield;
  return (
    <div
      role="status"
      className="flex items-start gap-3 border-b border-border bg-surface-2 px-4 py-3 text-ink"
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warn" />
      <div className="min-w-0">
        <p className="font-display text-base font-bold leading-tight">
          {t(`guardian.status.${status}.title`)}
        </p>
        <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-ink-muted">
          {t(`guardian.status.${status}.body`)}
        </p>
      </div>
    </div>
  );
}
