import {
  captureSitePageView,
  initializeSiteTelemetry,
  installSiteTelemetryListeners,
} from "./lib/client/telemetry";

// Os listeners são manuais e globais para cobrir falhas anteriores à hidratação.
// A importação do SDK continua dinâmica e só ocorre com configuração válida e
// sem opt-out persistido/DNT/GPC.
installSiteTelemetryListeners();
void initializeSiteTelemetry().then((client) => {
  if (client) void captureSitePageView(window.location.pathname);
});

export function onRouterTransitionStart(url: string) {
  void captureSitePageView(url);
}
