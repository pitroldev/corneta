import {
  captureSitePageView,
  editorialContentIdFromDocument,
  installSiteTelemetryListeners,
} from "./lib/client/telemetry";
import { siteRoute } from "./lib/telemetry-schema";

// Install early listeners before hydration; the page view loads the SDK once the page is idle.
installSiteTelemetryListeners();
void captureSitePageView(
  window.location.pathname,
  editorialContentIdFromDocument(),
);

export function onRouterTransitionStart(url: string) {
  // Count the initial document here; the article island owns its page view to avoid duplicates.
  const { routeId } = siteRoute(url);
  if (routeId === "help_article" || routeId === "guide_article") return;
  void captureSitePageView(url);
}
