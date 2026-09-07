"use client";

import { useEffect } from "react";
import { captureSitePageView } from "@/lib/client/telemetry";

// Send only the allowlisted content ID; never derive telemetry from the URL or article text.
export function EditorialTelemetry({ contentId }: { contentId: string }) {
  useEffect(() => {
    void captureSitePageView(window.location.pathname, contentId);
  }, [contentId]);

  return null;
}
