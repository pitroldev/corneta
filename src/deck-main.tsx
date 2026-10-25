import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/baloo-2/latin-700.css";
import "@fontsource/baloo-2/latin-800.css";
import { DeckApp } from "./deck/DeckApp";
import "./deck/deck.css";

// The phone page is served on the home network: no Tauri bridge, telemetry or desktop store here.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DeckApp />
  </React.StrictMode>,
);
