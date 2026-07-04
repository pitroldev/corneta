import { describe, it, expect } from "vitest";
import { PLATFORMS } from "./platforms";
import type { PlatformId } from "./types";

const ids = Object.keys(PLATFORMS) as PlatformId[];

describe("PLATFORMS catálogo", () => {
  it.each(ids)("%s tem preset recomendado válido", (id) => {
    const p = PLATFORMS[id];
    expect(p.id).toBe(id); // a chave bate com o id interno
    expect(p.name.length).toBeGreaterThan(0);
    expect(["rtmp", "rtmps", "srt"]).toContain(p.protocol);
    const r = p.recommended;
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    expect(r.fps).toBeGreaterThan(0);
    expect(r.videoBitrateKbps).toBeGreaterThan(0);
    expect(r.audioBitrateKbps).toBeGreaterThan(0);
    expect(r.keyframeSec).toBeGreaterThan(0);
  });

  it("plataformas verticais são retrato (altura > largura)", () => {
    for (const id of ["tiktok", "instagram"] as PlatformId[]) {
      const r = PLATFORMS[id].recommended;
      expect(r.height).toBeGreaterThan(r.width);
    }
  });
});
