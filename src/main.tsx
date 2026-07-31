import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/baloo-2/latin-500.css";
import "@fontsource/baloo-2/latin-600.css";
import "@fontsource/baloo-2/latin-700.css";
import "@fontsource/baloo-2/latin-800.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { I18nFromConfig } from "./lib/i18n/provider";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary app>
      <I18nFromConfig>
        <App />
      </I18nFromConfig>
    </ErrorBoundary>
  </React.StrictMode>,
);
