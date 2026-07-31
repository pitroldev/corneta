import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, Eye, Shield, X } from "lucide-react";
import { useStore } from "../lib/store";
import { fmtUptime } from "../lib/utils";
import { useI18n } from "../lib/i18n";

/**
 * Faixa de status global ao vivo — viaja com o streamer em qualquer tela.
 * Reaproveita o visual da barra "JÁ VOLTO" (bloco sólido latão, borda grossa).
 * Aparece só quando `live`/`starting`; o estado também é anunciado pelo
 * `aria-live` do shell (App), então aqui o foco é o relance visual.
 */
export function LiveBar({ onOpen }: { onOpen: () => void }) {
  const { t, fmt } = useI18n();
  const state = useStore((s) => s.snapshot.state);
  const startedAt = useStore((s) => s.snapshot.startedAt);
  const targets = useStore((s) => s.snapshot.targets);
  const viewersTotal = useStore((s) => s.viewers.total);
  const guardianOn = useStore(
    (s) => s.config?.settings.guardianEnabled ?? false,
  );
  const brbOn = useStore((s) => s.config?.settings.brbEnabled ?? false);
  const autoBitrateOn = useStore(
    (s) => s.config?.settings.autoBitrate ?? false,
  );

  const live = state === "live";
  const starting = state === "starting";
  const error = state === "error";

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  // Dispensa da faixa de erro: volta a valer quando o estado muda (nova live/novo erro).
  const [errDismissed, setErrDismissed] = useState(false);
  useEffect(() => {
    if (state !== "error") setErrDismissed(false);
  }, [state]);

  // A faixa de ERRO viaja junto: sem ela, a transmissão caía enquanto o streamer estava
  // no Chat/Mesa e o único sinal era uma pill minúscula no rodapé da sidebar.
  // Dispensável (X) — o erro persiste no snapshot até a próxima live, e a faixa em toda
  // tela pra sempre viraria ruído; a pill da sidebar continua contando a história.
  if (error && !errDismissed) {
    return (
      <div className="flex items-center border-b-2 border-bad bg-bad text-white">
        <button
          onClick={onOpen}
          aria-label={t("golive.bar.error.aria")}
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-1.5 text-left"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span className="font-display text-sm font-extrabold uppercase tracking-wide">
            {t("golive.bar.error.title")}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-white/85">
            {t("golive.bar.error.hint")}
          </span>
          <span className="flex items-center font-display text-xs font-extrabold uppercase">
            {t("golive.bar.panel")} <ChevronRight className="size-4" />
          </span>
        </button>
        <button
          onClick={() => setErrDismissed(true)}
          aria-label={t("golive.bar.dismiss.aria")}
          className="grid size-8 shrink-0 place-items-center text-white/70 transition-colors hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }
  if (error) return null;

  if (!live && !starting) return null;

  const secs = live && startedAt ? (now - startedAt) / 1000 : 0;
  const down = Object.values(targets).filter(
    (t) =>
      t.state === "error" ||
      t.state === "reconnecting" ||
      t.state === "signal-lost",
  ).length;
  const protections = [
    guardianOn && t("golive.bar.protection.guardian"),
    brbOn && t("golive.bar.protection.brb"),
    autoBitrateOn && t("golive.bar.protection.bitrate"),
  ].filter(Boolean) as string[];

  return (
    <button
      onClick={onOpen}
      data-on-brass
      aria-label={t("golive.bar.open.aria")}
      className="flex items-center gap-4 border-b-2 border-brass-ink bg-brass px-4 py-1.5 text-left text-brass-ink"
    >
      {live ? (
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-live live-dot" />
          <span className="font-display text-lg font-extrabold leading-none tabular-nums">
            {fmtUptime(secs)}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wide">
            {t("golive.bar.onAir")}
          </span>
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-brass-ink animate-pulse" />
          <span className="font-display text-sm font-extrabold uppercase tracking-wide">
            {t("golive.bar.waitingObs")}
          </span>
        </span>
      )}

      {viewersTotal > 0 && (
        <span className="flex items-center gap-1.5">
          <Eye className="size-4" />
          <span className="font-display text-lg font-extrabold leading-none tabular-nums">
            {fmt.num(viewersTotal)}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wide">
            {t("golive.bar.watching")}
          </span>
        </span>
      )}

      {down > 0 && (
        <span className="flex items-center gap-1.5 rounded-sm bg-bad px-2 py-0.5 text-white">
          <AlertTriangle className="size-3.5" />
          <span className="text-[11px] font-bold uppercase tracking-wide">
            {t("golive.bar.down", { n: down })}
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
          {t("golive.bar.panel")} <ChevronRight className="size-4" />
        </span>
      </span>
    </button>
  );
}
