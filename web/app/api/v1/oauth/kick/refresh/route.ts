import {
  ApiError,
  apiJson,
  clientAddress,
  errorResponse,
  providerForm,
  readJson,
  requiredString,
} from "@/lib/server/http";
import { getOAuthConfig } from "@/lib/server/oauth-config";
import { oauthTokens } from "@/lib/server/oauth-tokens";
import { rateLimit } from "@/lib/server/rate-limit";
import { createApiTelemetryContext } from "@/lib/server/telemetry-reporter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const telemetry = createApiTelemetryContext(request, "kick_refresh", "kick");
  try {
    await rateLimit(`kick:refresh:${clientAddress(request)}`, 60, 60_000);
    const config = getOAuthConfig();
    if (!config.kick.clientId || !config.kick.clientSecret) {
      throw new ApiError(
        503,
        "OAUTH_NOT_CONFIGURED",
        "Kick OAuth ainda não está configurado no servidor.",
      );
    }
    const body = await readJson<{ refreshToken?: unknown }>(request);
    const refreshToken = requiredString(body.refreshToken, "refreshToken");
    const { response, body: provider } = await providerForm(
      "https://id.kick.com/oauth/token",
      {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.kick.clientId,
        client_secret: config.kick.clientSecret,
      },
    );
    if (!response.ok) {
      const invalid =
        provider.error === "invalid_grant" || response.status === 401;
      throw new ApiError(
        invalid ? 401 : 502,
        invalid ? "OAUTH_SESSION_EXPIRED" : "PROVIDER_REJECTED_REQUEST",
        invalid
          ? "A sessão da Kick expirou. Entre novamente."
          : "A Kick recusou a renovação.",
        !invalid,
      );
    }
    return apiJson(oauthTokens(provider), telemetry);
  } catch (error) {
    return errorResponse(error, telemetry);
  }
}
