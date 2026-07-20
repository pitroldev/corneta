import {
  ApiError,
  clientAddress,
  errorResponse,
  json,
  providerForm,
  readJson,
  requiredString,
} from "@/lib/server/http";
import { getOAuthConfig } from "@/lib/server/oauth-config";
import { rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    rateLimit(`youtube:refresh:${clientAddress(request)}`, 60, 60_000);
    const config = getOAuthConfig();
    if (!config.youtube.clientId || !config.youtube.clientSecret) {
      throw new ApiError(
        503,
        "OAUTH_NOT_CONFIGURED",
        "YouTube OAuth ainda não está configurado no servidor.",
      );
    }
    const body = await readJson<{ refreshToken?: unknown }>(request);
    const refreshToken = requiredString(body.refreshToken, "refreshToken");
    const { response, body: provider } = await providerForm(
      "https://oauth2.googleapis.com/token",
      {
        client_id: config.youtube.clientId,
        client_secret: config.youtube.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      },
    );
    if (!response.ok) {
      const invalid = provider.error === "invalid_grant";
      throw new ApiError(
        invalid ? 401 : 502,
        invalid ? "OAUTH_SESSION_EXPIRED" : "PROVIDER_REJECTED_REQUEST",
        invalid
          ? "A sessão do YouTube expirou. Entre novamente."
          : "O Google recusou a renovação.",
        !invalid,
      );
    }
    const accessToken = String(provider.access_token ?? "");
    if (!accessToken) {
      throw new ApiError(
        502,
        "INVALID_PROVIDER_RESPONSE",
        "O Google não retornou o token esperado.",
      );
    }
    return json({
      accessToken,
      refreshToken: provider.refresh_token ?? null,
      expiresIn: Number(provider.expires_in) || 3_600,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
