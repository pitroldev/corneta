import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, X } from "lucide-react";
import { useStore } from "../lib/store";
import { toast } from "../lib/toast";
import { useT } from "../lib/i18n";
import { cn, errMsg } from "../lib/utils";
import { Button } from "./ui";
import {
  checkForUpdate,
  installUpdate,
  scheduleBootCheck,
  subscribeUpdateStatus,
  updateBusy,
  useUpdate,
} from "../lib/updater";

// Faixa de "tem versão nova". Fica no topo, acima das telas.
//
// Regra dura: NÃO reiniciar durante a live. A instalação mata o processo, e o
// processo é dono do MediaMTX e de um FFmpeg por destino — reiniciar no ar derruba
// a transmissão de todo mundo que está assistindo. Com o motor rodando, o botão
// vira aviso e a atualização espera.

export function UpdateBanner() {
  const t = useT();
  const info = useUpdate((s) => s.info);
  const dismissed = useUpdate((s) => s.dismissed);
  const setInfo = useUpdate((s) => s.setInfo);
  const dismiss = useUpdate((s) => s.dismiss);
  const progress = useUpdate((s) => s.progress);
  // After reload only the native lock is known, not the download's current phase.
  const phase = useUpdate((s) => (s.installing ? s.phase : null));
  const installing = useUpdate(updateBusy);
  // Qualquer estado que não seja "stopped" conta como no ar: em `starting` os
  // processos já subiram, e em `error` um destino pode continuar transmitindo.
  const live = useStore((s) => s.snapshot.state !== "stopped");

  useEffect(() => scheduleBootCheck(setInfo), [setInfo]);
  useEffect(subscribeUpdateStatus, []);

  if ((!info || dismissed) && !installing) return null;

  const install = async () => {
    if (!info || installing || live) return;
    try {
      await installUpdate(info);
      // Só chega aqui se o relaunch não aconteceu.
      toast.info(t("components.update.installed.toast"));
    } catch (e) {
      toast.error(t("components.update.install.error", { error: errMsg(e) }));
    }
  };

  const pct = progress == null ? null : Math.round(progress * 100);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b-2 border-brass/40 bg-brass/10 px-4 py-2 text-sm">
      <Download className="size-4 shrink-0 text-brass" />
      <span className="min-w-0 flex-1 basis-64">
        <strong className="font-display font-bold">
          {info
            ? t("components.update.headline", { version: info.version })
            : t("components.update.inProgress")}
        </strong>
        {/* No ar, a frase diz o MOTIVO de o botão estar morto. "Atualize depois"
            sozinho parece capricho; "derrubaria a live" a pessoa entende na hora. */}
        <span className="ml-2 text-ink-muted">
          {installing
            ? t("golive.block.updating")
            : live
              ? t("components.update.blocked.live")
              : t("components.update.ready")}
        </span>
      </span>

      {installing ? (
        <span
          className="flex items-center gap-2 text-xs font-semibold text-ink-muted"
          role="status"
        >
          <Loader2 className="size-4 animate-spin" />
          {phase == null
            ? t("components.update.inProgress")
            : phase === "installing"
              ? t("components.update.installing")
              : pct == null
                ? t("components.update.downloading")
                : t("components.update.downloading.pct", { pct })}
        </span>
      ) : (
        <Button
          variant="primary"
          size="sm"
          disabled={live}
          title={live ? t("components.update.cta.blocked.title") : undefined}
          onClick={() => void install()}
        >
          {t("components.update.cta")}
        </Button>
      )}

      {!installing && (
        <button
          onClick={dismiss}
          className="rounded p-1 text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
          title={t("components.update.dismiss.title")}
          aria-label={t("components.update.dismiss.aria")}
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Botão "Procurar atualizações" da tela Sobre — o caminho manual, sem esperar o
 *  boot. Diz explicitamente quando NÃO há nada, senão o clique parece não fazer nada. */
export function CheckUpdateButton({ version }: { version: string }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const installing = useUpdate(updateBusy);
  const setInfo = useUpdate((s) => s.setInfo);

  const run = async () => {
    setBusy(true);
    try {
      const info = await checkForUpdate();
      setInfo(info);
      if (info)
        toast.success(
          t("components.update.check.found", { version: info.version }),
        );
      // Dizer a versão em que a pessoa está importa: sem isso o clique parece
      // não ter feito nada.
      else toast.info(t("components.update.check.none", { version }));
    } catch (e) {
      toast.error(t("components.update.check.error", { error: errMsg(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={() => void run()}
      disabled={busy || installing}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold text-ink-faint",
        "transition-colors hover:text-brass disabled:opacity-50",
      )}
    >
      <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
      {busy
        ? t("components.update.check.busy")
        : t("components.update.check.cta")}
    </button>
  );
}
