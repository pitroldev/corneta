import {
  captureSitePageView,
  editorialContentIdFromDocument,
  initializeSiteTelemetry,
  installSiteTelemetryListeners,
} from "./lib/client/telemetry";
import { siteRoute } from "./lib/telemetry-schema";

// Install early listeners before hydration and lazy SDK initialization.
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
  // Count the initial document here; the article island owns its page view to avoid duplicates.
  const { routeId } = siteRoute(url);
  if (routeId === "help_article" || routeId === "guide_article") return;
  void captureSitePageView(url);
}
