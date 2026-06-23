import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Check, Loader2, Plug, X } from "lucide-react";
import { useStore } from "../lib/store";
import { IS_TAURI } from "../lib/api";
import { Button, Input } from "./ui";

type Status = "idle" | "connecting" | "ok" | "error";

export function ObsWizard({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.config!.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const connect = async () => {
    setStatus("connecting");
    setError("");
    if (!IS_TAURI) {
      // Demonstração no navegador: simula sucesso.
      setTimeout(() => setStatus("ok"), 900);
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("obs_autoconfigure");
      setStatus("ok");
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[80] grid place-items-center bg-night/80 p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.92, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 16, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className="w-full max-w-lg overflow-hidden rounded-xl bg-surface pop"
      >
        <div className="flex items-center justify-between bg-brass px-5 py-4 text-brass-ink">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-brass-ink text-brass">
              <Plug className="size-5" strokeWidth={2.3} />
            </div>
            <div>
              <h2 className="text-xl">Conectar ao OBS</h2>
              <p className="text-xs font-semibold opacity-80">A Corneta configura o OBS sozinha.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-brass-ink/70 hover:text-brass-ink" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <Step n={1} title="Ative o WebSocket no OBS">
            No OBS: <strong className="text-ink">Ferramentas → Configurações do Servidor WebSocket</strong> e
            marque <strong className="text-ink">Ativar Servidor WebSocket</strong> (porta padrão 4455).
          </Step>

          <Step n={2} title="Senha (se tiver)">
            Se <strong className="text-ink">Ativar Autenticação</strong> estiver marcado, clique em{" "}
            <strong className="text-ink">Mostrar Chave de Conexão</strong>, copie e cole aqui. Sem senha? Deixe vazio.
            <Input
              type="password"
              placeholder="senha do obs-websocket"
              className="mt-2"
              value={settings.obsPassword}
              onChange={(e) => setSettings({ obsPassword: e.target.value })}
            />
          </Step>

          <Step n={3} title="Conecte">
            A Corneta conecta e já aponta o OBS pra ela. Depois é só dar{" "}
            <strong className="text-ink">Iniciar transmissão</strong> no OBS.
          </Step>

          {status === "ok" && (
            <div className="flex items-center gap-2 rounded-md bg-ok/15 px-3 py-2 text-sm font-semibold text-ok">
              <Check className="size-4 shrink-0" strokeWidth={2.6} /> Conectado! O OBS já está apontando pra Corneta.
            </div>
          )}
          {status === "error" && (
            <div className="flex items-start gap-2 rounded-md bg-bad/15 px-3 py-2 text-sm text-bad">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <button onClick={onClose} className="text-sm font-semibold text-ink-faint hover:text-ink-muted">
              Fechar
            </button>
            {status === "ok" ? (
              <Button variant="primary" onClick={onClose}>
                Pronto <Check className="size-4" strokeWidth={2.6} />
              </Button>
            ) : (
              <Button variant="primary" onClick={connect} disabled={status === "connecting"}>
                {status === "connecting" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Conectando…
                  </>
                ) : (
                  "Conectar e configurar"
                )}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-2 font-display text-sm font-extrabold text-brass">
        {n}
      </span>
      <div>
        <div className="font-display font-bold">{title}</div>
        <div className="mt-0.5 text-sm leading-relaxed text-ink-muted">{children}</div>
      </div>
    </div>
  );
}
