import { describe, expect, it } from "vitest";
import { engineErrorCause } from "./engineError";

describe("engineErrorCause", () => {
  it("offers the port fix only for a taken ingest port", () => {
    expect(engineErrorCause("ingest_port_in_use")).toBe("port");
  });

  it("groups the ingest server failures that a retry can clear", () => {
    for (const code of [
      "mediamtx_died",
      "mediamtx_spawn_failed",
      "local_port_in_use",
    ])
      expect(engineErrorCause(code)).toBe("ingest");
  });

  it("falls back to the generic panel for unknown or missing codes", () => {
    expect(engineErrorCause("engine_start_failed")).toBe("generic");
    expect(engineErrorCause(undefined)).toBe("generic");
  });
});
