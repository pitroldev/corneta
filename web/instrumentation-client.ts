import {
  captureSitePageView,
  editorialContentIdFromDocument,
  initializeSiteTelemetry,
  installSiteTelemetryListeners,
} from "./lib/client/telemetry";
import { siteRoute } from "./lib/telemetry-schema";

// Os listeners são manuais e globais para cobrir falhas anteriores à hidratação.
// A importação do SDK continua dinâmica e só ocorre com configuração válida e
// sem opt-out persistido/DNT/GPC.
installSiteTelemetryListeners();
void initializeSiteTelemetry().then((client) => {
  if (client) {
    void captureSitePageView(
      window.location.pathname,
      editorialContentIdFromDocument(),
    );
  }
});

export function onRouterTransitionStart(url: string) {
  // O novo documento ainda não chegou neste hook. Artigos são capturados pelo
  // pequeno island montado junto do conteúdo, já com seu contentId allowlisted;
  // emitir aqui geraria uma page view genérica e outra identificada.
  const { routeId } = siteRoute(url);
  if (routeId === "help_article" || routeId === "guide_article") return;
  void captureSitePageView(url);
}
