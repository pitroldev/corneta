import { apiJson, errorResponse } from "@/lib/server/http";
import { getOAuthConfig } from "@/lib/server/oauth-config";
import { createApiTelemetryContext } from "@/lib/server/telemetry-reporter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const telemetry = createApiTelemetryContext(request, "bootstrap", "none");
  try {
    const config = getOAuthConfig();
    return apiJson(
      {
        schemaVersion: 1,
        providers: {
          twitch: {
            enabled: Boolean(config.twitch.clientId),
            clientId: config.twitch.clientId || null,
            flow: "direct-device",
          },
          youtube: {
            enabled: Boolean(config.youtube.clientId),
            clientId: config.youtube.clientId || null,
            flow: "direct-pkce",
          },
          kick: {
            enabled: Boolean(config.kick.clientId && config.kick.clientSecret),
            clientId: config.kick.clientId || null,
            flow: "brokered-pkce",
          },
        },
      },
      telemetry,
    );
  } catch (error) {
    return errorResponse(error, telemetry);
  }
}
