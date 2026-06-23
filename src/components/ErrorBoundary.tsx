import { Component, type ReactNode } from "react";

/** Captura erros de render de um pedaço da UI pra não derrubar o app inteiro. */
export class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
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

  render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-[60vh] place-items-center p-8">
          <div className="max-w-md text-center">
            <div className="mb-2 text-4xl">😵</div>
            <h3 className="font-display text-2xl font-extrabold">
              {this.props.label ?? "Essa tela deu pau"}
            </h3>
            <p className="mt-1 text-sm text-ink-muted">
              Algo quebrou ao desenhar aqui. As outras telas seguem funcionando — troque de tela ou
              tente de novo. (Se aparecer sempre, me manda o texto abaixo.)
            </p>
            <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-surface-2 p-2.5 text-left text-[11px] leading-relaxed text-bad">
              {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
            </pre>
            <button
              onClick={this.reset}
              className="mt-3 rounded-md bg-brass px-3.5 py-1.5 font-display text-sm font-extrabold text-brass-ink pop-sm"
            >
              Tentar de novo
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
