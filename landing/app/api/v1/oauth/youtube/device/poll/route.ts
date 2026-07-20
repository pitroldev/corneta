import {
  ApiError,
  clientAddress,
  errorResponse,
  json,
  providerForm,
  readJson,
} from "@/lib/server/http";
import { getOAuthConfig } from "@/lib/server/oauth-config";
import { rateLimit } from "@/lib/server/rate-limit";
import { openAttempt } from "@/lib/server/sealed-attempt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
type Attempt = {
  version: 1;
  provider: "youtube";
  deviceCode: string;
  expiresAt: number;
  interval: number;
};

export async function POST(request: Request) {
  try {
    rateLimit(`youtube:poll:${clientAddress(request)}`, 180, 10 * 60_000);
    const config = getOAuthConfig();
    if (!config.youtube.clientId || !config.youtube.clientSecret) {
      throw new ApiError(
        503,
        "OAUTH_NOT_CONFIGURED",
        "YouTube OAuth ainda não está configurado no servidor.",
      );
    }
    const body = await readJson<{ attempt?: unknown }>(request);
    const attempt = openAttempt<Attempt>(body.attempt, config.brokerSecret);
    if (
      attempt.version !== 1 ||
      attempt.provider !== "youtube" ||
      !attempt.deviceCode
    ) {
      throw new ApiError(400, "INVALID_ATTEMPT", "Tentativa OAuth inválida.");
    }
    if (attempt.expiresAt <= Date.now()) {
      throw new ApiError(
        410,
        "OAUTH_ATTEMPT_EXPIRED",
        "O código expirou. Inicie a conexão novamente.",
        true,
      );
    }

    const { response, body: provider } = await providerForm(
      "https://oauth2.googleapis.com/token",
      {
        client_id: config.youtube.clientId,
        client_secret: config.youtube.clientSecret,
        device_code: attempt.deviceCode,
        grant_type: DEVICE_GRANT,
      },
    );

    if (response.ok) {
      const accessToken = String(provider.access_token ?? "");
      if (!accessToken) {
        throw new ApiError(
          502,
          "INVALID_PROVIDER_RESPONSE",
          "O Google não retornou o token esperado.",
        );
      }
      return json({
        status: "connected",
        accessToken,
        refreshToken: provider.refresh_token ?? null,
        expiresIn: Number(provider.expires_in) || 3_600,
      });
    }

    const providerError = String(provider.error ?? "");
    if (providerError === "authorization_pending") {
      return json(
        { status: "pending", retryAfter: attempt.interval },
        { status: 202 },
      );
    }
    if (providerError === "slow_down") {
      return json(
        { status: "slow_down", retryAfter: attempt.interval + 5 },
        { status: 429 },
      );
    }
    if (providerError === "access_denied") {
      throw new ApiError(
        403,
        "OAUTH_ACCESS_DENIED",
        "A autorização foi cancelada.",
      );
    }
    if (providerError === "expired_token") {
      throw new ApiError(
        410,
        "OAUTH_ATTEMPT_EXPIRED",
        "O código expirou. Inicie a conexão novamente.",
        true,
      );
    }
    throw new ApiError(
      502,
      "PROVIDER_REJECTED_REQUEST",
      "O Google recusou a autorização.",
    );
  } catch (error) {
    return errorResponse(error);
  }
}
