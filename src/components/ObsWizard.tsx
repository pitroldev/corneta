import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Plug,
  Wrench,
  X,
} from "lucide-react";
import { useStore } from "../lib/store";
import { IS_TAURI } from "../lib/api";
import { obsIngestUrl } from "../lib/factory";
import { cn } from "../lib/utils";
import { Modal } from "./Modal";
import { Button, CopyField, Input } from "./ui";

type Status = "idle" | "connecting" | "ok" | "error";

/** Traduz o erro cru do obs-websocket pra um recado na voz da casa + checklist. */
function obsErrorHelp(raw: string): { title: string; tips: string[] } {
  const e = raw.toLowerCase();
  if (
    e.includes("auth") ||
    e.includes("password") ||
    e.includes("senha") ||
    e.includes("401") ||
    e.includes("403") ||
    e.includes("fechou") ||
    e.includes("4009") ||
    e.includes("closed") ||
    e.includes("close")
  ) {
    return {
      title: "A senha do WebSocket não bateu.",
      tips: [
        "Pegue a senha certa no OBS: Ferramentas → Configurações do Servidor WebSocket → Mostrar Chave de Conexão.",
        "Cole ela no passo 2 aqui em cima e tente de novo.",
        "Se “Ativar Autenticação” estiver desmarcado no OBS, é porque não tem senha — deixe o campo vazio.",
      ],
    };
  }
  if (
    e.includes("refus") ||
    e.includes("connect") ||
    e.includes("timed") ||
    e.includes("timeout") ||
    e.includes("econn") ||
    e.includes("os error") ||
    e.includes("websocket") ||
    e.includes(" ws")
  ) {
    return {
      title: "Não achei o OBS pra conectar.",
      tips: [
        "O OBS está aberto aí no seu PC?",
        "O WebSocket está ligado? Ferramentas → Configurações do Servidor WebSocket → Ativar Servidor WebSocket.",
        "A porta continua a padrão, 4455?",
        "Algum firewall pode estar barrando a conexão — libere o OBS pra mim.",
      ],
    };
  }
  return {
    title: "Não consegui configurar o OBS sozinha.",
    tips: [
      "Confira se o OBS está aberto e com o WebSocket ligado (Ferramentas → Configurações do Servidor WebSocket).",
      "Sem estresse: dá pra configurar na mão logo abaixo.",
    ],
  };
}

export function ObsWizard({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.config!.settings);
  const ingest = useStore((s) => s.config!.ingest);
  const setSettings = useStore((s) => s.setSettings);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [manualOpen, setManualOpen] = useState(false);

  const help = error ? obsErrorHelp(error) : null;

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
      setManualOpen(true); // erro → já oferece o plano B na mão
    }
  };

  return (
    <Modal
      title="Conectar ao OBS"
      onClose={onClose}
      className="max-w-lg rounded-xl bg-surface pop"
    >
      <div className="sticky top-0 flex items-center justify-between bg-brass px-5 py-4 text-brass-ink">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-brass-ink text-brass">
            <Plug className="size-5" strokeWidth={2.3} />
          </div>
          <div>
            <h2 id="obs-wizard-title" className="text-xl">
              Conectar ao OBS
            </h2>
            <p className="text-xs font-semibold opacity-80">
              A Corneta configura o OBS sozinha.
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-brass-ink/70 hover:text-brass-ink"
          aria-label="Fechar"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <Step n={1} title="Ative o WebSocket no OBS">
          No OBS:{" "}
          <strong className="text-ink">
            Ferramentas → Configurações do Servidor WebSocket
          </strong>{" "}
          e marque{" "}
          <strong className="text-ink">Ativar Servidor WebSocket</strong> (a
          porta já vem 4455, pode deixar).
        </Step>

        <Step n={2} title="Senha (se tiver)">
          Se <strong className="text-ink">Ativar Autenticação</strong> estiver
          marcado, clique em{" "}
          <strong className="text-ink">Mostrar Chave de Conexão</strong>, copie
          e cole aqui. Sem senha? Deixe vazio.
          <Input
            type="password"
            placeholder="senha do WebSocket"
            className="mt-2"
            value={settings.obsPassword}
            onChange={(e) => setSettings({ obsPassword: e.target.value })}
          />
        </Step>

        {/* O autoconfigure só grava servidor+chave no OBS — quem dá o play é o
              BORA (se autoStartObs) ou o próprio streamer. A copy segue a realidade. */}
        <Step n={3} title="Conecte">
          {settings.autoStartObs ? (
            <>
              Eu conecto e configuro o OBS pra apontar pra cá. Na hora do{" "}
              <strong className="text-ink">BORA AO VIVO</strong>, eu mesma dou o
              play no OBS.
            </>
          ) : (
            <>
              Eu conecto e configuro o OBS pra apontar pra cá. Depois, na hora
              da live, é só dar{" "}
              <strong className="text-ink">Iniciar transmissão</strong> no OBS.
            </>
          )}
        </Step>

        {status === "ok" && (
          <div className="flex items-center gap-2 rounded-md bg-ok/15 px-3 py-2 text-sm font-semibold text-ok">
            <Check className="size-4 shrink-0" strokeWidth={2.6} />{" "}
            {settings.autoStartObs
              ? "Conectado! O OBS já aponta pra Corneta. Quando você der BORA AO VIVO, eu mando o OBS transmitir sozinho."
              : "Conectado! O OBS já aponta pra Corneta. Na hora da live, é só clicar Iniciar transmissão no OBS."}
          </div>
        )}
        {status === "error" && help && (
          <div className="rounded-md border-2 border-bad/40 bg-bad/10 p-3">
            <div className="flex items-center gap-2 font-display font-bold text-bad">
              <AlertTriangle className="size-4 shrink-0" /> {help.title}
            </div>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-muted">
              {help.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            <details className="mt-2 text-xs text-ink-faint">
              <summary className="cursor-pointer select-none font-semibold">
                Ver detalhe técnico
              </summary>
              <p
                data-selectable
                className="mt-1 font-mono break-all text-ink-muted"
              >
                {error}
              </p>
            </details>
          </div>
        )}

        {/* Plano B sempre presente: configurar na mão (auto-aberto no erro). */}
        <div className="rounded-md border-2 border-border-soft bg-surface-2">
          <button
            onClick={() => setManualOpen((o) => !o)}
            aria-expanded={manualOpen}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-ink-muted hover:text-ink"
          >
            <Wrench className="size-4 text-brass" />
            Prefiro configurar na mão
            <ChevronDown
              className={cn(
                "ml-auto size-4 transition-transform",
                manualOpen && "rotate-180",
              )}
            />
          </button>
          {manualOpen && (
            <div className="flex flex-col gap-2 border-t border-border-soft p-3">
              <p className="text-xs text-ink-faint">
                Na mão também é rápido. No OBS:{" "}
                <strong className="text-ink-muted">
                  Configurações → Transmissão → Serviço “Personalizado”
                </strong>{" "}
                e cole estes dois campos:
              </p>
              <CopyField label="Servidor" value={obsIngestUrl(ingest)} />
              <CopyField label="Chave de transmissão" value={ingest.key} mono />
              <p className="text-xs text-ink-faint">
                {/* Na mão, o WebSocket pode não estar de pé — promessa mais modesta. */}
                {settings.autoStartObs ? (
                  <>
                    Com isso colado, na hora do{" "}
                    <strong className="text-ink-muted">BORA AO VIVO</strong> eu
                    tento dar o play no OBS pra você — se nada acontecer, dê{" "}
                    <strong className="text-ink-muted">
                      Iniciar transmissão
                    </strong>{" "}
                    nele.
                  </>
                ) : (
                  <>
                    Depois, na hora da live, é só dar{" "}
                    <strong className="text-ink-muted">
                      Iniciar transmissão
                    </strong>{" "}
                    no OBS.
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            onClick={onClose}
            className="text-sm font-semibold text-ink-faint hover:text-ink-muted"
          >
            Fechar
          </button>
          {status === "ok" ? (
            <Button variant="primary" onClick={onClose}>
              Pronto <Check className="size-4" strokeWidth={2.6} />
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={connect}
              loading={status === "connecting"}
              disabled={status === "connecting"}
            >
              {status === "connecting"
                ? "Conectando…"
                : status === "error"
                  ? "Tentar de novo"
                  : "Conectar e configurar"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-2 font-display text-sm font-extrabold text-brass">
        {n}
      </span>
      <div>
        <div className="font-display font-bold">{title}</div>
        <div className="mt-0.5 text-sm leading-relaxed text-ink-muted">
          {children}
        </div>
      </div>
    </div>
  );
}
