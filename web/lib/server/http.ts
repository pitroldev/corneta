import "server-only";

import { after } from "next/server";
import { ApiError } from "./api-error";
import { readBoundedText } from "./bounded-body";
export { ApiError } from "./api-error";
export { clientAddress } from "./rate-limit-core";
import type { ApiErrorCode } from "../telemetry-schema";
import { reportApiFailure } from "./posthog";
import {
  sanitizedErrorLog,
  type ApiTelemetryContext,
} from "./telemetry-reporter";

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(NO_STORE_HEADERS)) {
    headers.set(name, value);
  }
  return Response.json(data, {
    ...init,
    headers,
  });
}

export function apiJson(
  data: unknown,
  context: ApiTelemetryContext,
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("X-Request-Id", context.requestId);
  return json(data, { ...init, headers });
}

function scheduleFailureReport(
  error: unknown,
  context: ApiTelemetryContext,
  status: number,
  retryable: boolean,
  errorCode: ApiErrorCode,
) {
  const failure = {
    context,
    status,
    retryable,
    errorCode,
    ...(error instanceof ApiError ? {} : { unexpectedError: error }),
  };
  try {
    after(async () => {
      try {
        await reportApiFailure(failure);
      } catch {
        // A resposta já foi produzida; falha do provedor é sempre descartável.
      }
    });
  } catch {
    // Fora de um request do Next (por exemplo, num teste), telemetria é no-op.
  }
}

export function errorResponse(error: unknown, context: ApiTelemetryContext) {
  if (error instanceof ApiError) {
    scheduleFailureReport(
      error,
      context,
      error.status,
      error.retryable,
      error.code,
    );
    return apiJson(
      {
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          requestId: context.requestId,
        },
      },
      context,
      {
        status: error.status,
        ...(error.retryAfterSeconds !== undefined
          ? { headers: { "Retry-After": String(error.retryAfterSeconds) } }
          : {}),
      },
    );
  }

  console.error("API request failed", {
    requestId: context.requestId,
    routeId: context.routeId,
    provider: context.provider,
    error: sanitizedErrorLog(error),
  });
  scheduleFailureReport(error, context, 500, true, "INTERNAL_ERROR");
  return apiJson(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Não foi possível concluir a operação.",
        retryable: true,
        requestId: context.requestId,
      },
    },
    context,
    { status: 500 },
  );
}

export async function readJson<T>(request: Request, maxBytes = 8_192) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError(413, "BODY_TOO_LARGE", "Requisição muito grande.");
  }

  try {
    const raw = await readBoundedText(request.body, maxBytes);
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("INVALID_JSON");
    return value as T;
  } catch (error) {
    if (error instanceof Error && error.message === "BODY_TOO_LARGE")
      throw new ApiError(413, "BODY_TOO_LARGE", "Requisição muito grande.");
    if (error instanceof Error && error.message === "BODY_TIMEOUT")
      throw new ApiError(
        408,
        "INVALID_REQUEST",
        "A requisição demorou demais. Tente novamente.",
        true,
      );
    throw new ApiError(400, "INVALID_JSON", "JSON inválido.");
  }
}

export function requiredString(
  value: unknown,
  field: string,
  maxLength = 4_096,
) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new ApiError(400, "INVALID_REQUEST", `Campo inválido: ${field}.`);
  }
  return value.trim();
}

export async function providerForm(
  url: string,
  fields: Record<string, string>,
) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(fields),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new ApiError(
      503,
      "PROVIDER_UNAVAILABLE",
      "O provedor não respondeu. Tente novamente.",
      true,
    );
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await readBoundedText(response.body, 32_768);
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("INVALID_PROVIDER_RESPONSE");
    body = value as Record<string, unknown>;
  } catch {
    throw new ApiError(
      502,
      "INVALID_PROVIDER_RESPONSE",
      "O provedor retornou uma resposta inválida.",
      true,
    );
  }
  return { response, body };
}
