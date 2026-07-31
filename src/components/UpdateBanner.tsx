import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, X } from "lucide-react";
import { useStore } from "../lib/store";
import { toast } from "../lib/toast";
import { cn, errMsg } from "../lib/utils";
import { Button } from "./ui";
import {
  checkForUpdate,
  installUpdate,
  scheduleBootCheck,
  useUpdate,
} from "../lib/updater";

// Faixa de "tem versão nova". Fica no topo, acima das telas.
//
// Regra dura: NÃO reiniciar durante a live. A instalação mata o processo, e o
// processo é dono do MediaMTX e de um FFmpeg por destino — reiniciar no ar derruba
// a transmissão de todo mundo que está assistindo. Com o motor rodando, o botão
// vira aviso e a atualização espera.

export function UpdateBanner() {
  const info = useUpdate((s) => s.info);
  const dismissed = useUpdate((s) => s.dismissed);
  const setInfo = useUpdate((s) => s.setInfo);
  const dismiss = useUpdate((s) => s.dismiss);
  const [progress, setProgress] = useState<number | null>(null);
  const [installing, setInstalling] = useState(false);
  const engineState = useStore((s) => s.snapshot.state);
  // Qualquer estado que não seja "stopped" conta como no ar: em `starting` os
  // processos já subiram, e em `error` um destino pode continuar transmitindo.
  const live = engineState !== "stopped";

  useEffect(() => scheduleBootCheck(setInfo), [setInfo]);

  if (!info || dismissed) return null;

  const install = async () => {
    setInstalling(true);
    try {
      await installUpdate(info, setProgress);
      // Só chega aqui se o relaunch não aconteceu.
      toast.info("Instalei — feche e abra a Corneta pra terminar.");
    } catch (e) {
      toast.error(`Não consegui instalar: ${errMsg(e)}`);
      setInstalling(false);
      setProgress(null);
    }
  };

  const pct = progress == null ? null : Math.round(progress * 100);

  return (
    <div className="flex items-center gap-3 border-b-2 border-brass/40 bg-brass/10 px-4 py-2 text-sm">
      <Download className="size-4 shrink-0 text-brass" />
      <span className="flex-1">
        <strong className="font-display font-bold">
          Saiu a Corneta {info.version}
        </strong>
        {/* No ar, a frase diz o MOTIVO de o botão estar morto. "Atualize depois"
            sozinho parece capricho; "derrubaria a live" a pessoa entende na hora. */}
        <span className="ml-2 text-ink-muted">
          {live
            ? "Você tá no ar — instalar agora derrubaria a live."
            : "Instalo e abro de novo num instante."}
        </span>
      </span>

      {installing ? (
        <span className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
          <Loader2 className="size-4 animate-spin" />
          {pct == null ? "Baixando…" : `Baixando ${pct}%`}
        </span>
      ) : (
        <Button
          variant="primary"
          size="sm"
          disabled={live}
          title={live ? "Não dá pra reiniciar no meio da live" : undefined}
          onClick={() => void install()}
        >
          Atualizar agora
        </Button>
      )}

      {!installing && (
        <button
          onClick={dismiss}
          className="rounded p-1 text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
          title="Agora não"
          aria-label="Fechar o aviso da atualização"
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
  const [busy, setBusy] = useState(false);
  const setInfo = useUpdate((s) => s.setInfo);

  const run = async () => {
    setBusy(true);
    try {
      const info = await checkForUpdate();
      setInfo(info);
      if (info)
        toast.success(
          `Saiu a Corneta ${info.version} — o aviso tá lá em cima.`,
        );
      // Dizer a versão em que a pessoa está importa: sem isso o clique parece
      // não ter feito nada.
      else toast.info(`Nada novo por aqui — você já tá na ${version}.`);
    } catch (e) {
      toast.error(`Não consegui checar agora: ${errMsg(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={() => void run()}
      disabled={busy}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold text-ink-faint",
        "transition-colors hover:text-brass disabled:opacity-50",
      )}
    >
      <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
      {busy ? "Olhando…" : "Ver se tem versão nova"}
    </button>
  );
}
