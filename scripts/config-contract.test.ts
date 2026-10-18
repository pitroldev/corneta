import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  addProfile,
  addTarget,
  duplicateTarget,
  moveTarget,
  removeTarget,
  renameProfile,
  syncTargetsToPlatforms,
  toggleTarget,
  updateTarget,
} from "../src/lib/configOps";
import { defaultConfig } from "../src/lib/factory";
import { PLATFORMS } from "../src/lib/platforms";
import type { AppConfig, PlatformId } from "../src/lib/types";

const ids = vi.hoisted(() => ({ next: 0 }));
vi.mock("../src/lib/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/utils")>()),
  uid: (prefix = "t") => `${prefix}_${String(++ids.next).padStart(4, "0")}`,
}));

/** src-tauri's config tests run every scenario through the native validator. */
const FIXTURE = new URL(
  "../src-tauri/tests/fixtures/config-contract.json",
  import.meta.url,
);

function scenarios(): { name: string; config: AppConfig }[] {
  ids.next = 0;
  const base = defaultConfig();
  const platforms = Object.keys(PLATFORMS) as PlatformId[];
  const everyPlatform = platforms.reduce(
    (config, platform) => addTarget(config, platform).config,
    base,
  );
  const first = everyPlatform.targets[0]!.id;
  const edited = updateTarget(
    toggleTarget(
      moveTarget(
        duplicateTarget(everyPlatform, first, "tgt_copy"),
        "tgt_copy",
        1,
      ),
      first,
    ),
    "tgt_copy",
    { name: "Cópia editada", ingestUrl: "rtmps://example.com/live" },
  );
  const withProfiles = renameProfile(
    addProfile(edited, "prof_second", (n) => `Perfil ${n}`),
    "prof_second",
    "Podcast",
  );
  const trimmed = removeTarget(withProfiles, first).config;
  const synced = syncTargetsToPlatforms(base, ["kick", "custom"]);
  const settings: AppConfig = {
    ...base,
    settings: {
      ...base.settings,
      youtubePrivacy: "unlisted",
      youtubeMadeForKids: true,
      youtubeAutoLive: false,
      streamTitle: "Live de teste",
    },
  };
  return [
    { name: "default", config: base },
    { name: "every platform added", config: everyPlatform },
    { name: "duplicated, moved, toggled and edited", config: edited },
    { name: "second profile renamed", config: withProfiles },
    { name: "target removed", config: trimmed },
    { name: "platforms synced from onboarding", config: synced },
    { name: "settings changed", config: settings },
  ];
}

describe("configuration contract with the native validator", () => {
  it("matches the fixture the Rust tests validate", () => {
    const actual = `${JSON.stringify(scenarios(), null, 2)}\n`;
    if (process.env.UPDATE_CONFIG_CONTRACT === "1") {
      writeFileSync(FIXTURE, actual);
    }
    expect(
      actual,
      "regenerate with UPDATE_CONFIG_CONTRACT=1, then run `cargo test ts_generated_configs`",
    ).toBe(readFileSync(FIXTURE, "utf8"));
  });
});
