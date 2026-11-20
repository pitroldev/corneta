import {
  ApiError,
  apiJson,
  clientAddress,
  errorResponse,
  providerRevokeForm,
  readJson,
  requiredString,
} from "@/lib/server/http";
import { getOAuthConfig } from "@/lib/server/oauth-config";
import { rateLimit } from "@/lib/server/rate-limit";
import { createApiTelemetryContext } from "@/lib/server/telemetry-reporter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_HINTS = new Set(["refresh_token", "access_token"]);

export async function POST(request: Request) {
  const telemetry = createApiTelemetryContext(request, "kick_revoke", "kick");
  try {
    await rateLimit(`kick:revoke:${clientAddress(request)}`, 30, 60_000);
    const config = getOAuthConfig();
    if (!config.kick.clientId || !config.kick.clientSecret) {
      throw new ApiError(
        503,
        "OAUTH_NOT_CONFIGURED",
        "Kick OAuth is not configured on the server.",
      );
    }
    const body = await readJson<{
      token?: unknown;
      tokenTypeHint?: unknown;
    }>(request);
    const token = requiredString(body.token, "token");
    let tokenTypeHint: string | undefined;
    if (body.tokenTypeHint !== undefined) {
      if (
        typeof body.tokenTypeHint !== "string" ||
        !ALLOWED_HINTS.has(body.tokenTypeHint)
      ) {
        throw new ApiError(
          400,
          "INVALID_REQUEST",
          "Invalid field: tokenTypeHint.",
        );
      }
      tokenTypeHint = body.tokenTypeHint;
    }

    const fields: Record<string, string> = {
      token,
      client_id: config.kick.clientId,
      client_secret: config.kick.clientSecret,
    };
    if (tokenTypeHint) {
      fields.token_type_hint = tokenTypeHint;
    }

    const { response, body: provider } = await providerRevokeForm(
      "https://id.kick.com/oauth/revoke",
      fields,
    );
    // RFC 7009 treats already-invalid or expired tokens as revoked.
    const alreadyInvalid =
      response.status === 400 &&
      (provider.error === "invalid_token" ||
        provider.error === "invalid_grant");
    if (!response.ok && !alreadyInvalid) {
      throw new ApiError(
        502,
        "PROVIDER_REJECTED_REQUEST",
        "Kick rejected the token revocation.",
        true,
      );
    }
    return apiJson({ revoked: true }, telemetry);
  } catch (error) {
    return errorResponse(error, telemetry);
  }
}
