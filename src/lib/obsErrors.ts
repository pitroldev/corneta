import type { ObsErrorCode } from "./types";

export interface ObsFailure {
  code?: ObsErrorCode;
  message: string;
}

/** The native OBS commands reject with `{ code, message }`; anything else has no code. */
export function obsFailure(error: unknown): ObsFailure {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    const code =
      "code" in error && typeof error.code === "string"
        ? (error.code as ObsErrorCode)
        : undefined;
    return { code, message: error.message };
  }
  return { message: String(error) };
}

export type ObsHelpKind = "auth" | "notFound" | "generic";

/** Choose the help by the native failure code, never by the translated message. */
export function obsHelpKind(code: ObsErrorCode | undefined): ObsHelpKind {
  if (
    code === "passwordRequired" ||
    code === "authenticationFailed" ||
    code === "identificationFailed"
  )
    return "auth";
  return code === "connectionFailed" ? "notFound" : "generic";
}
