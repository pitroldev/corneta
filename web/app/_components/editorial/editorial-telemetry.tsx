"use client";

import { useEffect } from "react";
import { captureSitePageView } from "@/lib/client/telemetry";

/**
 * Identifica a page view editorial depois que a rota cliente já montou.
 * A fachada de telemetria reduz `pathname` a um route_id fechado e nunca
 * transmite URL, query string, hash ou o texto do artigo.
 */
export function EditorialTelemetry({ contentId }: { contentId: string }) {
  useEffect(() => {
    void captureSitePageView(window.location.pathname, contentId);
  }, [contentId]);

  return null;
}
