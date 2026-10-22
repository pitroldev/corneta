import { describe, it, expect } from "vitest";
import {
  PLATFORMS,
  PLATFORM_LIST,
  SETUP_PLATFORMS,
  STARTER_PLATFORMS,
  isVertical,
} from "./platforms";
import { en } from "./i18n/en";
import { pt } from "./i18n/pt";
import { INGEST_URL_RE } from "./validation";

const ids = PLATFORM_LIST.map((p) => p.id);

describe("destination catalog", () => {
  it("has unique ids and keeps the custom destination", () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect(PLATFORMS.custom).toBeDefined();
  });

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

  it.each(ids)("%s has a note and a tagline in both languages", (id) => {
    for (const dict of [pt, en] as Record<string, string>[]) {
      expect(dict[`core.platform.${id}.note`]).toBeTruthy();
      expect(dict[`core.platform.tagline.${id}`]).toBeTruthy();
    }
  });

  it("vertical platforms use portrait dimensions", () => {
    expect(isVertical("tiktok")).toBe(true);
    expect(isVertical("instagram")).toBe(true);
    expect(isVertical("twitch")).toBe(false);
  });

  it("setup only offers complete, non-experimental destinations with a key page", () => {
    expect(SETUP_PLATFORMS).toEqual(["twitch", "youtube", "kick", "facebook"]);
    for (const id of SETUP_PLATFORMS) {
      const p = PLATFORMS[id];
      expect(p.experimental).toBeFalsy();
      expect(p.keyUrl).toBeTruthy();
      expect(INGEST_URL_RE.test(p.ingestUrl)).toBe(true);
    }
  });

  it("a new configuration starts with Twitch and YouTube", () => {
    expect(STARTER_PLATFORMS).toEqual(["twitch", "youtube"]);
  });
});
