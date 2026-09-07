import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/baloo-2/latin-600.css";
import "@fontsource/baloo-2/latin-700.css";
import "@fontsource/baloo-2/latin-800.css";
import { ChatPopout } from "./screens/ChatPopout";
import { crashText } from "./components/ErrorBoundary";
import { api } from "./lib/api";
import { I18nFromConfig } from "./lib/i18n/provider";
import { captureException, initializeTelemetry } from "./lib/telemetry";
import { redactTelemetryText } from "./lib/telemetry-schema";
import "./index.css";

// Keep this entry independent of App so the popout does not load engine, navigation or shortcut setup.
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; errorId: string | null }
> {
  state = { error: null as Error | null, errorId: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const errorId = captureException(error, {
      handled: false,
      severity: "error",
      error_code: "chat_render_failed",
      stage: "chat_render",
      screen_id: "chat_popout",
      component_stack: info.componentStack ?? undefined,
    });
    if (errorId) this.setState({ errorId });
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
          <p style={{ color: "#ff8a6a" }}>
            {redactTelemetryText(this.state.error.message || "UI error", 500)}
          </p>
          {this.state.errorId && (
            <p style={{ color: "#c6b69b" }}>
              {text.errorId}: {this.state.errorId}
            </p>
          )}
          <details style={{ marginTop: 8 }}>
            <summary>{text.details}</summary>
            <pre
              style={{ whiteSpace: "pre-wrap", marginTop: 8, color: "#ff8a6a" }}
            >
              {redactTelemetryText(
                String(this.state.error.stack || this.state.error),
                4_000,
              )}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

function render() {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <I18nFromConfig>
          <ChatPopout />
        </I18nFromConfig>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

void initializeTelemetry(api);
render();
