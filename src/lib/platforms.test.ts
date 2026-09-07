import { describe, it, expect } from "vitest";
import { PLATFORMS } from "./platforms";
import type { PlatformId } from "./types";

const ids = Object.keys(PLATFORMS) as PlatformId[];

describe("PLATFORMS catalog", () => {
  it.each(ids)("%s has a valid recommended preset", (id) => {
    const p = PLATFORMS[id];
    expect(p.id).toBe(id);
    expect(p.name.length).toBeGreaterThan(0);
    expect(["rtmp", "rtmps"]).toContain(p.protocol);
    const r = p.recommended;
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    expect(r.fps).toBeGreaterThan(0);
    expect(r.videoBitrateKbps).toBeGreaterThan(0);
    expect(r.audioBitrateKbps).toBeGreaterThan(0);
    expect(r.keyframeSec).toBeGreaterThan(0);
  });

  it("vertical platforms use portrait dimensions", () => {
    for (const id of ["tiktok", "instagram"] as PlatformId[]) {
      const r = PLATFORMS[id].recommended;
      expect(r.height).toBeGreaterThan(r.width);
    }
  });
});
