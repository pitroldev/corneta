import "server-only";

import { after } from "next/server";
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

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

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
      { status: error.status },
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

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    throw new ApiError(413, "BODY_TOO_LARGE", "Requisição muito grande.");
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
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

  const raw = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
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

export function clientAddress(request: Request) {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
