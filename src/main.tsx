import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter/wght.css";
import "@fontsource/baloo-2/latin-500.css";
import "@fontsource/baloo-2/latin-600.css";
import "@fontsource/baloo-2/latin-700.css";
import "@fontsource/baloo-2/latin-800.css";
import App from "./App";
import { ChatPopout } from "./screens/ChatPopout";
import "./index.css";

// A janela flutuante do chat renderiza SÓ o popout (não o app inteiro), pra não
// rodar o motor/atalhos/etc. num segundo webview.
const isPopout =
  typeof window !== "undefined" && window.location.hash === "#chat-popout";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isPopout ? <ChatPopout /> : <App />}</React.StrictMode>
);
