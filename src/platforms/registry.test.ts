import { describe, expect, it } from "vitest";
import { ACCOUNT_PLATFORMS } from ".";
import { DESTINATIONS } from "./destinations";
import { makeTarget } from "../lib/factory";
import { en } from "../lib/i18n/en";
import { pt } from "../lib/i18n/pt";
import {
  FALLBACK_PLATFORM,
  PLATFORMS,
  platformName,
  presetOf,
} from "../lib/platforms";
import {
  TELEMETRY_SCHEMA_VERSION,
  sanitizeTelemetryProperties,
  type TelemetryContext,
} from "../lib/telemetry-schema";

const ids = DESTINATIONS.map((d) => d.id);
const t = ((key: string) =>
  (pt as Record<string, string>)[key] ?? key) as never;
const context: TelemetryContext = {
  telemetry_schema_version: TELEMETRY_SCHEMA_VERSION,
  surface: "desktop_ui",
  environment: "development",
  app_version: "0.0.0",
  build_sha: "abc123",
  locale: "pt-BR",
  os_family: "windows",
};

describe("destination registry", () => {
  it("has exactly one fallback, used for ids the catalog does not know", () => {
    expect(DESTINATIONS.filter((d) => d.fallback)).toHaveLength(1);
    expect(presetOf("nao-existe")).toBe(PLATFORMS[FALLBACK_PLATFORM]);
  });

  it("links only to account providers the app registers", () => {
    for (const d of DESTINATIONS)
      if (d.account) expect(ACCOUNT_PLATFORMS).toContain(d.account);
  });

  it.each(ids)("%s works in every consumer without code of its own", (id) => {
    expect(makeTarget(id).platformId).toBe(id);
    expect(platformName(id, t)).toBeTruthy();
    if (PLATFORMS[id].localizedName)
      for (const dict of [pt, en] as Record<string, string>[])
        expect(dict[`core.platform.${id}.name`]).toBeTruthy();
    expect(
      sanitizeTelemetryProperties(
        "live_start_requested",
        {
          operation_id: "00000000-0000-4000-8000-000000000001",
          mode: "per-platform",
          target_count: 1,
          platforms: [id],
          brb_enabled: false,
          guardian_enabled: false,
          record_video_enabled: false,
        },
        context,
      ),
    ).toMatchObject({ platforms: [id] });
  });
});
