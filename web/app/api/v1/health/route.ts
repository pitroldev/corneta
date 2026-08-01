import { apiJson, errorResponse } from "@/lib/server/http";
import { readTelemetryDeploymentMetadata } from "@/lib/server/deployment-metadata";
import { createApiTelemetryContext } from "@/lib/server/telemetry-reporter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const telemetry = createApiTelemetryContext(request, "health", "none");
  try {
    return apiJson(
      {
        status: "ok",
        telemetryDeployment: readTelemetryDeploymentMetadata(),
      },
      telemetry,
    );
  } catch (error) {
    return errorResponse(error, telemetry);
  }
}
