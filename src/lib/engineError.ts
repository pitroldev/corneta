/** What stopped the live, grouped by the fix the Live screen can offer. */
export type EngineErrorCause = "port" | "ingest" | "generic";

const INGEST_CODES = new Set([
  // A taken port that is not the ingest's: moving the ingest would not free it.
  "local_port_in_use",
  "mediamtx_died",
  "mediamtx_spawn_failed",
  "mediamtx_sidecar_missing",
  "mediamtx_config_path_failed",
  "mediamtx_config_write_failed",
]);

export function engineErrorCause(code: string | undefined): EngineErrorCause {
  if (code === "ingest_port_in_use") return "port";
  return code && INGEST_CODES.has(code) ? "ingest" : "generic";
}
