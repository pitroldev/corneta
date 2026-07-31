import { Component, type ReactNode } from "react";
import { useStore } from "../lib/store";
import { resolveLocale, type Locale } from "../lib/i18n/locale";

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
    body: "Algo quebrou ao desenhar aqui. As outras telas seguem funcionando — troque de tela ou tente de novo. (Se aparecer sempre, me manda o texto abaixo.)",
    details: "Detalhes técnicos",
    copy: "Copiar erro",
    retry: "Tentar de novo",
    chatTitle: "O chat falhou ao carregar.",
  },
  en: {
    title: "This screen broke",
    titleApp: "Corneta tripped",
    body: "Something went wrong drawing this. The other screens still work — switch screens or try again. (If it keeps happening, send me the text below.)",
    details: "Technical details",
    copy: "Copy the error",
    retry: "Try again",
    chatTitle: "The chat didn't load.",
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
  { children: ReactNode; app?: boolean },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Fica no console pra diagnóstico (e some ao trocar de tela / "tentar de novo").
    console.error("[Corneta] erro de render:", error);
  }

  reset = () => this.setState({ error: null });
  copy = () => {
    const error = this.state.error;
    if (error)
      void navigator.clipboard.writeText(
        String(error.stack || error.message || error),
      );
  };

  render() {
    if (this.state.error) {
      const text = crashText();
      return (
        <div className="grid min-h-[60vh] place-items-center p-8">
          <div className="max-w-md text-center">
            <div className="mb-2 text-4xl">😵</div>
            <h3 className="font-display text-2xl font-extrabold">
              {this.props.app ? text.titleApp : text.title}
            </h3>
            <p className="mt-1 text-sm text-ink-muted">{text.body}</p>
            <p className="mt-3 rounded-md bg-surface-2 p-2.5 text-left text-xs text-bad">
              {this.state.error.message}
            </p>
            <details className="mt-2 text-left text-xs text-ink-muted">
              <summary className="cursor-pointer font-bold">
                {text.details}
              </summary>
              <pre className="mt-2 max-h-40 overscroll-contain overflow-auto rounded-md bg-surface-2 p-2.5 text-[11px] leading-relaxed text-bad">
                {String(this.state.error.stack || this.state.error)}
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
