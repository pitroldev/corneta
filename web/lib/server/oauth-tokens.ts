import { ApiError } from "./api-error";

export function oauthTokens(provider: Record<string, unknown>) {
  const accessToken = provider.access_token;
  const refreshToken = provider.refresh_token ?? null;
  const expiry = provider.expires_in;
  const expiresIn =
    expiry == null
      ? null
      : typeof expiry === "string" || typeof expiry === "number"
        ? Number(expiry)
        : NaN;
  if (
    typeof accessToken !== "string" ||
    !accessToken.trim() ||
    accessToken.length > 16_384 ||
    (refreshToken !== null &&
      (typeof refreshToken !== "string" ||
        !refreshToken.trim() ||
        refreshToken.length > 4_096)) ||
    (expiresIn !== null &&
      ((typeof provider.expires_in !== "number" &&
        typeof provider.expires_in !== "string") ||
        !Number.isSafeInteger(expiresIn) ||
        expiresIn <= 0))
  ) {
    throw new ApiError(
      502,
      "INVALID_PROVIDER_RESPONSE",
      "A Kick não retornou uma sessão válida. Tente novamente.",
      true,
    );
  }
  return { accessToken, refreshToken, expiresIn };
}
