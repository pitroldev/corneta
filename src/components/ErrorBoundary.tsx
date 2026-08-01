import { Component, type ReactNode } from "react";
import { useStore } from "../lib/store";
import { resolveLocale, type Locale } from "../lib/i18n/locale";
import { captureException } from "../lib/telemetry";
import { redactTelemetryText, type ScreenId } from "../lib/telemetry-schema";

// Esta é a ÚNICA tela do app que não pode depender do dicionário.
//
// O boundary de fora (main.tsx) envolve o próprio `I18nFromConfig`: se o
// dicionário falhar ao carregar, é ESTA tela que aparece — e chamar `t()` aqui
// devolveria "error.crash.title" cru pro usuário ver. Então as seis frases da
// tela de erro moram aqui dentro, ao lado do código que as usa, e o idioma sai
// do mesmo lugar de sempre (config → sistema) sem esperar chunk nenhum.
//
// Mexeu no tom de voz? Mexe aqui também — o linter não avisa.
const CRASH: Record<Locale, Record<string, string>> = {
  "pt-BR": {
    title: "Essa tela deu pau",
    titleApp: "A Corneta tropeçou",
    body: "Não consegui desenhar esta tela. As outras seguem funcionando — troca de tela ou tenta de novo. (Se acontecer sempre, me manda o texto aqui embaixo.)",
    details: "Detalhes técnicos",
    copy: "Copiar erro",
    retry: "Tentar de novo",
    errorId: "ID do erro",
    chatTitle: "Não consegui carregar o chat — fecha e abre esta janela.",
  },
  en: {
    title: "This screen broke",
    titleApp: "Corneta tripped",
    body: "Couldn't draw this screen. The others still work — switch screens or try again. (If it keeps happening, send me the text right below.)",
    details: "Technical details",
    copy: "Copy the error",
    retry: "Try again",
    errorId: "Error ID",
    chatTitle: "Couldn't load the chat — close and reopen this window.",
  },
};

/** Idioma sem passar pelo provider — `getState` não é hook e não quebra se o
 *  store ainda não subiu. Exportado porque o popout do chat tem o próprio
 *  boundary (com estilo inline, caso o CSS também não tenha carregado) e as
 *  frases têm que sair do mesmo lugar. */
export function crashText(): Record<string, string> {
  try {
    return CRASH[resolveLocale(useStore.getState().config?.settings.language)];
  } catch {
    return CRASH[resolveLocale(undefined)];
  }
}

/** Captura erros de render de um pedaço da UI pra não derrubar o app inteiro.
 *
 *  `app`: é o boundary de fora, o que pega o app INTEIRO caindo — o título
 *  muda porque "essa tela deu pau" mentiria quando não sobrou tela nenhuma. */
export class ErrorBoundary extends Component<
  { children: ReactNode; app?: boolean; screenId?: ScreenId },
  { error: Error | null; errorId: string | null }
> {
  state = { error: null as Error | null, errorId: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Fica no console pra diagnóstico (e some ao trocar de tela / "tentar de novo").
    console.error("[Corneta] erro de render:", error);
    const errorId = captureException(error, {
      handled: false,
      severity: this.props.app ? "fatal" : "error",
      error_code: this.props.app ? "app_render_failed" : "screen_render_failed",
      stage: this.props.app ? "app_render" : "screen_render",
      screen_id: this.props.screenId,
      component_stack: info.componentStack ?? undefined,
    });
    if (errorId) this.setState({ errorId });
  }

  reset = () => this.setState({ error: null, errorId: null });
  copy = () => {
    const error = this.state.error;
    if (error)
      void navigator.clipboard.writeText(
        [
          this.state.errorId
            ? `${crashText().errorId}: ${this.state.errorId}`
            : "",
          redactTelemetryText(
            String(error.stack || error.message || error),
            4_000,
          ),
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
  };

  render() {
    if (this.state.error) {
      const text = crashText();
      const safeMessage = redactTelemetryText(
        this.state.error.message || "UI error",
        500,
      );
      const safeDetails = redactTelemetryText(
        String(this.state.error.stack || this.state.error),
        4_000,
      );
      return (
        <div className="grid min-h-[60vh] place-items-center p-8">
          <div className="max-w-md text-center">
            <h3 className="font-display text-2xl font-extrabold">
              {this.props.app ? text.titleApp : text.title}
            </h3>
            <p className="mt-1 text-sm text-ink-muted">{text.body}</p>
            <p className="mt-3 rounded-md bg-surface-2 p-2.5 text-left text-xs text-bad">
              {safeMessage}
            </p>
            {this.state.errorId && (
              <p
                className="mt-2 font-mono text-[11px] text-ink-faint"
                data-selectable
              >
                {text.errorId}: {this.state.errorId}
              </p>
            )}
            <details className="mt-2 text-left text-xs text-ink-muted">
              <summary className="cursor-pointer font-bold">
                {text.details}
              </summary>
              <pre className="mt-2 max-h-40 overscroll-contain overflow-auto rounded-md bg-surface-2 p-2.5 text-[11px] leading-relaxed text-bad">
                {safeDetails}
              </pre>
            </details>
            <div className="mt-3 flex justify-center gap-2">
              <button
                onClick={this.copy}
                className="rounded-md bg-surface-2 px-3.5 py-1.5 font-display text-sm font-bold text-ink"
              >
                {text.copy}
              </button>
              <button
                onClick={this.reset}
                className="rounded-md bg-brass px-3.5 py-1.5 font-display text-sm font-extrabold text-brass-ink pop-sm"
              >
                {text.retry}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
