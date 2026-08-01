"use client";

import { useState, useSyncExternalStore } from "react";
import {
  isSiteTelemetryOptedOut,
  setSiteTelemetryEnabled,
  subscribeToSiteTelemetryPreference,
} from "@/lib/client/telemetry";
import type { Locale } from "@/lib/i18n";

const COPY = {
  "pt-BR": {
    enabled: "As métricas sem cookies estão ativas neste navegador.",
    disabled: "As métricas estão desativadas neste navegador.",
    enable: "Ativar métricas",
    disable: "Desativar métricas",
  },
  en: {
    enabled: "Cookieless metrics are active in this browser.",
    disabled: "Metrics are disabled in this browser.",
    enable: "Enable metrics",
    disable: "Disable metrics",
  },
} as const;

export function TelemetryPreference({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const optedOut = useSyncExternalStore(
    subscribeToSiteTelemetryPreference,
    isSiteTelemetryOptedOut,
    // O HTML inicial é conservador e igual no servidor/primeiro hydrate.
    () => true,
  );
  const [saving, setSaving] = useState(false);

  const toggle = () => {
    if (saving) return;
    setSaving(true);
    void setSiteTelemetryEnabled(optedOut).finally(() => setSaving(false));
  };

  return (
    <div className="mt-5 rounded-md border-2 border-ink/20 bg-white/55 p-4">
      <p aria-live="polite">{optedOut ? copy.disabled : copy.enabled}</p>
      <button
        className="mt-3 min-h-11 rounded-sm border-2 border-ink bg-brass px-4 py-2 font-display text-sm font-extrabold text-brass-ink shadow-[3px_3px_0_0_var(--ink)] disabled:cursor-wait disabled:opacity-60"
        type="button"
        disabled={saving}
        aria-pressed={optedOut === false}
        onClick={toggle}
      >
        {optedOut ? copy.enable : copy.disable}
      </button>
    </div>
  );
}
