import type { Instrumentation } from "next";
import type { ApiRouteId, TelemetryProvider } from "./lib/telemetry-schema";

export function register() {
  // O cliente Node é criado sob demanda; Edge e builds sem token ficam em no-op.
}

function routeContext(routePath: string): {
  routeId: ApiRouteId;
  provider: TelemetryProvider;
} {
  if (routePath.includes("/api/v1/oauth/kick/exchange")) {
    return { routeId: "kick_exchange", provider: "kick" };
  }
  if (routePath.includes("/api/v1/oauth/kick/refresh")) {
    return { routeId: "kick_refresh", provider: "kick" };
  }
  if (routePath.includes("/api/v1/bootstrap")) {
    return { routeId: "bootstrap", provider: "none" };
  }
  if (routePath.includes("/api/v1/health")) {
    return { routeId: "health", provider: "none" };
  }
  if (routePath.includes("/api/")) {
    return { routeId: "unknown", provider: "none" };
  }
  return { routeId: "site_render", provider: "none" };
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  _request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const [{ createApiTelemetryContext }, { reportApiFailure }] =
      await Promise.all([
        import("./lib/server/telemetry-reporter"),
        import("./lib/server/posthog"),
      ]);
    const route = routeContext(context.routePath);
    const telemetry = createApiTelemetryContext(
      { headers: new Headers() },
      route.routeId,
      route.provider,
    );
    await reportApiFailure({
      context: telemetry,
      status: 500,
      retryable: true,
      errorCode: "UNEXPECTED_ERROR",
      unexpectedError: error,
      handled: false,
    });
  } catch {
    // O hook de diagnóstico nunca pode mascarar o erro original do Next.js.
  }
};
