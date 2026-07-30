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

const PKCE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

export async function POST(request: Request) {
  try {
    rateLimit(`kick:exchange:${clientAddress(request)}`, 20, 60_000);
    const config = getOAuthConfig();
    if (!config.kick.clientId || !config.kick.clientSecret) {
      throw new ApiError(
        503,
        "OAUTH_NOT_CONFIGURED",
        "Kick OAuth ainda não está configurado no servidor.",
      );
    }
    const body = await readJson<{
      code?: unknown;
      codeVerifier?: unknown;
      redirectUri?: unknown;
    }>(request);
    const code = requiredString(body.code, "code");
    const codeVerifier = requiredString(body.codeVerifier, "codeVerifier", 128);
    const redirectUri = requiredString(body.redirectUri, "redirectUri", 512);
    if (!PKCE_VERIFIER.test(codeVerifier)) {
      throw new ApiError(400, "INVALID_PKCE", "PKCE verifier inválido.");
    }
    if (!config.kick.redirectUris.has(redirectUri)) {
      throw new ApiError(
        400,
        "INVALID_REDIRECT_URI",
        "Redirect URI não permitida.",
      );
    }

    const { response, body: provider } = await providerForm(
      "https://id.kick.com/oauth/token",
      {
        grant_type: "authorization_code",
        client_id: config.kick.clientId,
        client_secret: config.kick.clientSecret,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        code,
      },
    );
    if (!response.ok) {
      throw new ApiError(
        response.status === 400 ? 400 : 502,
        "PROVIDER_REJECTED_REQUEST",
        "A Kick recusou a conclusão do login.",
      );
    }
    const accessToken = String(provider.access_token ?? "");
    if (!accessToken) {
      throw new ApiError(
        502,
        "INVALID_PROVIDER_RESPONSE",
        "A Kick não retornou o token esperado.",
      );
    }
    return json({
      accessToken,
      refreshToken: provider.refresh_token ?? null,
      expiresIn: Number(provider.expires_in) || null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
