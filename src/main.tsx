import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/baloo-2/latin-500.css";
import "@fontsource/baloo-2/latin-600.css";
import "@fontsource/baloo-2/latin-700.css";
import "@fontsource/baloo-2/latin-800.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { api } from "./lib/api";
import { I18nFromConfig } from "./lib/i18n/provider";
import { initializeTelemetry } from "./lib/telemetry";
import "./index.css";

function render() {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary app>
        <I18nFromConfig>
          <App />
        </I18nFromConfig>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

// Lê somente o arquivo local de consentimento antes de montar. Sem opt-in ou
// sem token, o módulo do PostHog nem entra no WebView.
void initializeTelemetry(api).finally(render);
