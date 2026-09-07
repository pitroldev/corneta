import {
  durationBucket,
  isUuid,
  redactedException,
  sanitizeTelemetryProperties,
  statusClass,
  telemetryBaseProperties,
  type ApiErrorCode,
  type ApiRouteId,
  type TelemetryProvider,
} from "../telemetry-schema";

export type ApiTelemetryContext = {
  requestId: string;
  operationId?: string;
  crashOperationId?: string;
  distinctId: string;
  crashDistinctId: string;
  routeId: ApiRouteId;
  provider: TelemetryProvider;
  startedAt: number;
};

export type ApiFailure = {
  context: ApiTelemetryContext;
  status: number;
  retryable: boolean;
  errorCode: ApiErrorCode;
  unexpectedError?: unknown;
  handled?: boolean;
};

export type TelemetrySink = {
  capture: (message: {
    distinctId: string;
    event: "api_request_completed";
    properties: Record<string, unknown>;
  }) => Promise<void>;
  captureException: (
    error: Error,
    distinctId: string,
    properties: Record<string, unknown>,
  ) => Promise<void>;
};

type ReporterOptions = {
  sink?: TelemetrySink;
  environment?: string;
  buildSha?: string;
  now?: () => number;
  randomUuid?: () => string;
};

export function createApiTelemetryContext(
  request: Pick<Request, "headers">,
  routeId: ApiRouteId,
  provider: TelemetryProvider,
  options: { now?: () => number; randomUuid?: () => string } = {},
): ApiTelemetryContext {
  const requestId = options.randomUuid?.() ?? crypto.randomUUID();
  const telemetryId = request.headers.get("x-corneta-telemetry-id")?.trim();
  const purposes = request.headers.get("x-corneta-telemetry-purposes")?.trim();
  const operationId = request.headers.get("x-corneta-operation-id")?.trim();
  const validTelemetryId = isUuid(telemetryId)
    ? telemetryId.toLowerCase()
    : undefined;
  const validPurposes = new Set(
    purposes === "usage,crash_reports"
      ? ["usage", "crash_reports"]
      : purposes === "usage" || purposes === "crash_reports"
        ? [purposes]
        : [],
  );
  const ephemeralDistinctId = `request:${requestId}`;
  const validOperationId =
    validTelemetryId && isUuid(operationId)
      ? operationId.toLowerCase()
      : undefined;

  return {
    requestId,
    ...(validOperationId && validPurposes.has("usage")
      ? { operationId: validOperationId }
      : {}),
    ...(validOperationId && validPurposes.has("crash_reports")
      ? { crashOperationId: validOperationId }
      : {}),
    distinctId:
      validTelemetryId && validPurposes.has("usage")
        ? validTelemetryId
        : ephemeralDistinctId,
    crashDistinctId:
      validTelemetryId && validPurposes.has("crash_reports")
        ? validTelemetryId
        : ephemeralDistinctId,
    routeId,
    provider,
    startedAt: options.now?.() ?? Date.now(),
  };
}

export function createTelemetryReporter(options: ReporterOptions) {
  const now = options.now ?? Date.now;
  const randomUuid = options.randomUuid ?? (() => crypto.randomUUID());

  return {
    async reportApiFailure(failure: ApiFailure) {
      if (!options.sink) return;
      const surface =
        failure.context.routeId === "site_render"
          ? "marketing_site"
          : "setup_api";
      const common = telemetryBaseProperties(
        surface,
        options.environment,
        options.buildSha,
      );
      const elapsed = Math.max(0, now() - failure.context.startedAt);

      try {
        if (failure.unexpectedError !== undefined) {
          const errorId = randomUuid();
          const properties = sanitizeTelemetryProperties("$exception", {
            ...common,
            error_id: errorId,
            request_id: failure.context.requestId,
            ...(failure.context.crashOperationId
              ? { operation_id: failure.context.crashOperationId }
              : {}),
            route_id: failure.context.routeId,
            provider: failure.context.provider,
            error_code: failure.errorCode,
            handled: failure.handled ?? true,
            severity: "error",
            error_type:
              failure.unexpectedError instanceof Error
                ? failure.unexpectedError.name
                : "UnknownError",
            $exception_handled: failure.handled ?? true,
          });
          if (!properties) return;
          await options.sink.captureException(
            redactedException(
              failure.unexpectedError,
              "Unexpected server error",
            ),
            failure.context.crashDistinctId,
            properties,
          );
          return;
        }

        const properties = sanitizeTelemetryProperties(
          "api_request_completed",
          {
            ...common,
            request_id: failure.context.requestId,
            ...(failure.context.operationId
              ? { operation_id: failure.context.operationId }
              : {}),
            route_id: failure.context.routeId,
            provider: failure.context.provider,
            status_class: statusClass(failure.status),
            duration_bucket: durationBucket(elapsed),
            retryable: failure.retryable,
            error_code: failure.errorCode,
          },
        );
        if (!properties) return;
        await options.sink.capture({
          distinctId: failure.context.distinctId,
          event: "api_request_completed",
          properties,
        });
      } catch {
        // Telemetry must not change API responses.
      }
    },
  };
}

export function sanitizedErrorLog(error: unknown) {
  const safe = redactedException(error, "Unexpected server error");
  return { name: safe.name, message: safe.message, stack: safe.stack };
}
