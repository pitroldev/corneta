import {
  ApiError,
  clientAddress,
  errorResponse,
  json,
  providerForm,
} from "@/lib/server/http";
import { getOAuthConfig } from "@/lib/server/oauth-config";
import { rateLimit } from "@/lib/server/rate-limit";
import { sealAttempt } from "@/lib/server/sealed-attempt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube";

export async function POST(request: Request) {
  try {
    rateLimit(`youtube:start:${clientAddress(request)}`, 10, 60_000);
    const config = getOAuthConfig();
    if (!config.youtube.clientId || !config.youtube.clientSecret) {
      throw new ApiError(
        503,
        "OAUTH_NOT_CONFIGURED",
        "YouTube OAuth ainda não está configurado no servidor.",
      );
    }

    const { response, body } = await providerForm(
      "https://oauth2.googleapis.com/device/code",
      { client_id: config.youtube.clientId, scope: YOUTUBE_SCOPE },
    );
    if (!response.ok) {
      throw new ApiError(
        502,
        "PROVIDER_REJECTED_REQUEST",
        "O Google recusou o início da autorização.",
      );
    }

    const deviceCode = String(body.device_code ?? "");
    const userCode = String(body.user_code ?? "");
    const verificationUri = String(
      body.verification_url ??
        body.verification_uri ??
        "https://www.google.com/device",
    );
    const verificationUriComplete = String(
      body.verification_url_complete ?? body.verification_uri_complete ?? "",
    );
    const expiresIn = Math.min(Number(body.expires_in) || 1_800, 1_800);
    const interval = Math.max(Number(body.interval) || 5, 1);
    if (!deviceCode || !userCode) {
      throw new ApiError(
        502,
        "INVALID_PROVIDER_RESPONSE",
        "O Google retornou uma resposta incompleta.",
      );
    }

    const attempt = sealAttempt(
      {
        version: 1,
        provider: "youtube",
        deviceCode,
        expiresAt: Date.now() + expiresIn * 1_000,
        interval,
      },
      config.brokerSecret,
    );

    return json({
      attempt,
      userCode,
      verificationUri,
      verificationUriComplete: verificationUriComplete || null,
      expiresIn,
      interval,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
