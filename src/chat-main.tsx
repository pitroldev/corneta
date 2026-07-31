import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/baloo-2/latin-600.css";
import "@fontsource/baloo-2/latin-700.css";
import "@fontsource/baloo-2/latin-800.css";
import { ChatPopout } from "./screens/ChatPopout";
import { crashText } from "./components/ErrorBoundary";
import { I18nFromConfig } from "./lib/i18n/provider";
import "./index.css";

// Entry DEDICADO da janela flutuante do chat. Não importa o App (motor, telas,
// atalhos, etc.) — só o necessário pro chat. Se algo quebrar, mostra o erro na
// tela em vez de ficar em branco.
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      const text = crashText();
      return (
        <div
          style={{
            padding: 16,
            font: "13px system-ui",
            color: "#fcf3e3",
            background: "#14100a",
            height: "100vh",
            overflow: "auto",
          }}
        >
          <strong>{text.chatTitle}</strong>
          <p style={{ color: "#ff8a6a" }}>{this.state.error.message}</p>
          <details style={{ marginTop: 8 }}>
            <summary>{text.details}</summary>
            <pre
              style={{ whiteSpace: "pre-wrap", marginTop: 8, color: "#ff8a6a" }}
            >
              {String(this.state.error.stack || this.state.error)}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nFromConfig>
        <ChatPopout />
      </I18nFromConfig>
    </ErrorBoundary>
  </React.StrictMode>,
);
