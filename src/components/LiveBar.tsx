import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, Eye, Shield } from "lucide-react";
import { useStore } from "../lib/store";
import { fmtUptime } from "../lib/utils";

/**
 * Faixa de status global ao vivo — viaja com o streamer em qualquer tela.
 * Reaproveita o visual da barra "JÁ VOLTO" (bloco sólido latão, borda grossa).
 * Aparece só quando `live`/`starting`; o estado também é anunciado pelo
 * `aria-live` do shell (App), então aqui o foco é o relance visual.
 */
export function LiveBar({ onOpen }: { onOpen: () => void }) {
  const state = useStore((s) => s.snapshot.state);
  const startedAt = useStore((s) => s.snapshot.startedAt);
  const targets = useStore((s) => s.snapshot.targets);
  const viewersTotal = useStore((s) => s.viewers.total);
  const guardianOn = useStore((s) => s.config?.settings.guardianEnabled ?? false);
  const brbOn = useStore((s) => s.config?.settings.brbEnabled ?? false);
  const autoBitrateOn = useStore((s) => s.config?.settings.autoBitrate ?? false);

  const live = state === "live";
  const starting = state === "starting";

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  if (!live && !starting) return null;

  const secs = live && startedAt ? (now - startedAt) / 1000 : 0;
  const down = Object.values(targets).filter(
    (t) => t.state === "error" || t.state === "reconnecting",
  ).length;
  const protections = [
    guardianOn && "Guardião",
    brbOn && "JÁ VOLTO",
    autoBitrateOn && "Auto-bitrate",
  ].filter(Boolean) as string[];

  return (
    <button
      onClick={onOpen}
      data-on-brass
      aria-label="Abrir o painel ao vivo"
      className="flex items-center gap-4 border-b-2 border-brass-ink bg-brass px-4 py-1.5 text-left text-brass-ink"
    >
      {live ? (
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-live live-dot" />
          <span className="font-display text-lg font-extrabold leading-none tabular-nums">
            {fmtUptime(secs)}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wide">no ar</span>
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-brass-ink animate-pulse" />
          <span className="font-display text-sm font-extrabold uppercase tracking-wide">
            Aguardando o OBS…
          </span>
        </span>
      )}

      {viewersTotal > 0 && (
        <span className="flex items-center gap-1.5">
          <Eye className="size-4" />
          <span className="font-display text-lg font-extrabold leading-none tabular-nums">
            {viewersTotal.toLocaleString("pt-BR")}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wide">assistindo</span>
        </span>
      )}

      {down > 0 && (
        <span className="flex items-center gap-1.5 rounded-sm bg-bad px-2 py-0.5 text-white">
          <AlertTriangle className="size-3.5" />
          <span className="text-[11px] font-bold uppercase tracking-wide">
            {down} destino{down > 1 ? "s" : ""} caiu
          </span>
        </span>
      )}

      <span className="ml-auto flex items-center gap-2">
        {protections.length > 0 && (
          <span className="hidden items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide opacity-80 sm:flex">
            <Shield className="size-3.5" /> {protections.join(" · ")}
          </span>
        )}
        <span className="flex items-center font-display text-xs font-extrabold uppercase">
          Painel <ChevronRight className="size-4" />
        </span>
      </span>
    </button>
  );
}
