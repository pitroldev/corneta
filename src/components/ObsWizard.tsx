import { useRef, useState, type ReactNode } from "react";
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
import { bold, useT, type I18n } from "../lib/i18n";
import { cn } from "../lib/utils";
import { Modal } from "./Modal";
import { Button, CopyField, Input } from "./ui";

type Status = "idle" | "connecting" | "ok" | "error";

/** Traduz o erro cru do obs-websocket pra um recado na voz da casa + checklist.
 *
 *  Não é componente: recebe o `t` de quem chama. As palavras comparadas aqui
 *  ("senha", "fechou"…) são o texto CRU do backend, não copy — não traduzir. */
function obsErrorHelp(
  t: I18n["t"],
  raw: string,
): { title: string; tips: string[] } {
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
      title: t("encoding.wizard.error.auth.title"),
      tips: [
        t("encoding.wizard.error.auth.tip1"),
        t("encoding.wizard.error.auth.tip2"),
        t("encoding.wizard.error.auth.tip3"),
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
      title: t("encoding.wizard.error.notfound.title"),
      tips: [
        t("encoding.wizard.error.notfound.tip1"),
        t("encoding.wizard.error.notfound.tip2"),
        t("encoding.wizard.error.notfound.tip3"),
        t("encoding.wizard.error.notfound.tip4"),
      ],
    };
  }
  return {
    title: t("encoding.wizard.error.generic.title"),
    tips: [
      t("encoding.wizard.error.generic.tip1"),
      t("encoding.wizard.error.generic.tip2"),
    ],
  };
}

export function ObsWizard({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.config!.settings);
  const ingest = useStore((s) => s.config!.ingest);
  const setSettings = useStore((s) => s.setSettings);
  const t = useT();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  // Foco inicial no título: o primeiro focável do DOM é o X de fechar.
  const titleRef = useRef<HTMLHeadingElement>(null);

  const help = error ? obsErrorHelp(t, error) : null;

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
      title={t("encoding.wizard.title")}
      onClose={onClose}
      className="max-w-lg rounded-xl bg-surface pop"
      initialFocusRef={titleRef}
    >
      <div className="sticky top-0 flex items-center justify-between bg-brass px-5 py-4 text-brass-ink">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-brass-ink text-brass">
            <Plug className="size-5" strokeWidth={2.3} />
          </div>
          <div>
            <h2
              id="obs-wizard-title"
              ref={titleRef}
              tabIndex={-1}
              className="text-xl outline-none"
            >
              {t("encoding.wizard.title")}
            </h2>
            <p className="text-xs font-semibold opacity-80">
              {t("encoding.wizard.subtitle")}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-brass-ink/70 hover:text-brass-ink"
          aria-label={t("encoding.close")}
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <Step n={1} title={t("encoding.wizard.step1.title")}>
          {bold(t, "encoding.wizard.step1.body")}
        </Step>

        <Step n={2} title={t("encoding.wizard.step2.title")}>
          {bold(t, "encoding.wizard.step2.body")}
          <Input
            type="password"
            aria-label={t("encoding.wizard.step2.title")}
            placeholder={t("encoding.wizard.step2.placeholder")}
            className="mt-2"
            value={settings.obsPassword}
            onChange={(e) => setSettings({ obsPassword: e.target.value })}
          />
        </Step>

        {/* O autoconfigure só grava servidor+chave no OBS — quem dá o play é o
              BORA (se autoStartObs) ou o próprio streamer. A copy segue a realidade. */}
        <Step n={3} title={t("encoding.wizard.step3.title")}>
          {settings.autoStartObs
            ? bold(t, "encoding.wizard.step3.body.autostart")
            : bold(t, "encoding.wizard.step3.body.manual")}
        </Step>

        {/* Os dois blocos montam depois do clique: role=status/alert faz o leitor de
            tela anunciar o resultado sem a pessoa precisar sair do botão. */}
        {status === "ok" && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-md bg-ok/15 px-3 py-2 text-sm font-semibold text-ok"
          >
            <Check className="size-4 shrink-0" strokeWidth={2.6} />{" "}
            {settings.autoStartObs
              ? bold(t, "encoding.wizard.ok.autostart")
              : bold(t, "encoding.wizard.ok.manual")}
          </div>
        )}
        {status === "error" && help && (
          <div
            role="alert"
            className="rounded-md border-2 border-bad/40 bg-bad/10 p-3"
          >
            <div className="flex items-center gap-2 font-display font-bold text-bad">
              <AlertTriangle className="size-4 shrink-0" /> {help.title}
            </div>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-muted">
              {help.tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
            <details className="mt-2 text-xs text-ink-faint">
              <summary className="cursor-pointer select-none font-semibold">
                {t("encoding.wizard.error.details")}
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
            {t("encoding.wizard.manual.toggle")}
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
                {bold(t, "encoding.wizard.manual.lede")}
              </p>
              <CopyField
                label={t("encoding.wizard.manual.server")}
                value={obsIngestUrl(ingest)}
              />
              <CopyField
                label={t("encoding.wizard.manual.key")}
                value={ingest.key}
                mono
              />
              <p className="text-xs text-ink-faint">
                {/* Na mão, o WebSocket pode não estar de pé — promessa mais modesta. */}
                {settings.autoStartObs
                  ? bold(t, "encoding.wizard.manual.note.autostart")
                  : bold(t, "encoding.wizard.manual.note.manual")}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            onClick={onClose}
            className="text-sm font-semibold text-ink-faint hover:text-ink-muted"
          >
            {t("encoding.close")}
          </button>
          {status === "ok" ? (
            <Button variant="primary" onClick={onClose}>
              {t("encoding.wizard.cta.done")}{" "}
              <Check className="size-4" strokeWidth={2.6} />
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={connect}
              loading={status === "connecting"}
              disabled={status === "connecting"}
            >
              {status === "connecting"
                ? t("encoding.wizard.cta.connecting")
                : status === "error"
                  ? t("encoding.wizard.cta.retry")
                  : t("encoding.wizard.cta.connect")}
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
