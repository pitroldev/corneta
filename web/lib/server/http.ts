import "server-only";

import { randomUUID } from "node:crypto";

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...init.headers },
  });
}

export function errorResponse(error: unknown) {
  const requestId = randomUUID();
  if (error instanceof ApiError) {
    return json(
      {
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          requestId,
        },
      },
      { status: error.status },
    );
  }

  console.error("OAuth broker request failed", { requestId });
  return json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Não foi possível concluir a operação.",
        retryable: true,
        requestId,
      },
    },
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
