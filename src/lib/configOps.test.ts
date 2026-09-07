import { describe, it, expect } from "vitest";
import * as ops from "./configOps";
import { defaultConfig } from "./factory";

const base = () => defaultConfig();

describe("configOps", () => {
  it("suffixName adds a suffix only on collision", () => {
    expect(ops.suffixName("Twitch", new Set())).toBe("Twitch");
    expect(ops.suffixName("Twitch", new Set(["Twitch"]))).toBe("Twitch 2");
    expect(ops.suffixName("Twitch", new Set(["Twitch", "Twitch 2"]))).toBe(
      "Twitch 3",
    );
  });

  it("addTarget uses unique names for repeated platforms", () => {
    const { config } = ops.addTarget(base(), "twitch");
    const names = config.targets.map((t) => t.name);
    expect(names).toContain("Twitch 2");
    expect(config.targets.length).toBe(3);
  });

  it("removeTarget returns the target and index for insertTarget to restore", () => {
    const c = base();
    const id = c.targets[0].id;
    const { config, removed } = ops.removeTarget(c, id);
    expect(config.targets.find((t) => t.id === id)).toBeUndefined();
    expect(removed?.index).toBe(0);
    const restored = ops.insertTarget(config, removed!.target, removed!.index);
    expect(restored.targets[0].id).toBe(id);
  });

  it("removeTarget returns null for an unknown ID", () => {
    expect(ops.removeTarget(base(), "nao-existe").removed).toBeNull();
  });

  it("toggleTarget reverses enabled", () => {
    const c = base();
    const id = c.targets[0].id;
    expect(ops.toggleTarget(c, id).targets[0].enabled).toBe(
      !c.targets[0].enabled,
    );
  });

  it("updateTarget follows the custom URL protocol", () => {
    const { config, id } = ops.addTarget(base(), "custom");
    const secure = ops.updateTarget(config, id, {
      ingestUrl: "rtmps://ingest.example.test/app",
    });
    expect(secure.targets.find((target) => target.id === id)).toMatchObject({
      protocol: "rtmps",
      ingestUrl: "rtmps://ingest.example.test/app",
    });

    const plain = ops.updateTarget(secure, id, {
      ingestUrl: "RTMP://ingest.example.test/app",
    });
    expect(plain.targets.find((target) => target.id === id)?.protocol).toBe(
      "rtmp",
    );
  });

  it("updateTarget preserves protocol while the URL is incomplete", () => {
    const c = base();
    const id = c.targets[0].id;
    const next = ops.updateTarget(c, id, { ingestUrl: "rtmps" });
    expect(next.targets[0].protocol).toBe(c.targets[0].protocol);
  });

  it("duplicateTarget inserts a keyless copy after the original", () => {
    const c = base();
    const dup = ops.duplicateTarget(c, c.targets[0].id, "tgt_novo");
    expect(dup.targets.length).toBe(c.targets.length + 1);
    expect(dup.targets[1].id).toBe("tgt_novo");
    expect(dup.targets[1].hasKey).toBe(false);
    expect(dup.targets[1].name).toBe(`${c.targets[0].name} 2`);
  });

  it("duplicateTarget and moveTarget preserve identity for unknown IDs", () => {
    const c = base();
    expect(ops.duplicateTarget(c, "nope", "x")).toBe(c);
    expect(ops.moveTarget(c, c.targets[0].id, -1)).toBe(c);
  });

  it("moveTarget swaps neighbors", () => {
    const c = base();
    const first = c.targets[0].id;
    expect(ops.moveTarget(c, first, 1).targets[1].id).toBe(first);
  });

  it("profile operations never leave the list empty", () => {
    let c = ops.addProfile(base(), "prof_2", (n) => `Perfil ${n}`);
    expect(c.profiles.length).toBe(2);
    expect(c.activeProfileId).toBe("prof_2");
    expect(c.profiles[1].name).toBe("Perfil 2");
    c = ops.renameProfile(c, "prof_2", "Evento");
    expect(c.profiles[1].name).toBe("Evento");
    const firstId = c.profiles[0].id;
    c = ops.loadProfile(c, firstId);
    expect(c.activeProfileId).toBe(firstId);
    c = ops.removeProfile(c, "prof_2");
    expect(c.profiles.length).toBe(1);
    expect(ops.removeProfile(c, c.profiles[0].id)).toBe(c);
  });

  it("loadProfile preserves identity for an unknown ID", () => {
    const c = base();
    expect(ops.loadProfile(c, "nope")).toBe(c);
  });

  it("loadProfile returns a new config even for the active profile", () => {
    const c = base();
    expect(ops.loadProfile(c, c.activeProfileId)).not.toBe(c);
  });

  it("removeProfile returns a new config for an unknown ID when multiple profiles exist", () => {
    const c = ops.addProfile(base(), "prof_2", (n) => `Perfil ${n}`);
    const next = ops.removeProfile(c, "nao-existe");
    expect(next).not.toBe(c);
    expect(next.profiles.length).toBe(2);
  });

  it("moveTarget preserves identity at the lower boundary", () => {
    const c = base();
    const last = c.targets[c.targets.length - 1].id;
    expect(ops.moveTarget(c, last, 1)).toBe(c);
  });

  it("syncTargetsToPlatforms preserves destinations with stored keys", () => {
    let c = base();
    const yt = c.targets.find((t) => t.platformId === "youtube")!;
    c = ops.updateTarget(c, yt.id, { hasKey: true });
    const next = ops.syncTargetsToPlatforms(c, ["kick"]);
    expect(next.targets.map((t) => t.platformId).sort()).toEqual([
      "kick",
      "youtube",
    ]);
  });

  it("syncTargetsToPlatforms preserves config for an empty selection", () => {
    const c = base();
    expect(ops.syncTargetsToPlatforms(c, [])).toBe(c);
  });

  it("syncTargetsToPlatforms creates missing destinations and removes unused keyless ones", () => {
    const next = ops.syncTargetsToPlatforms(base(), ["twitch", "kick"]);
    expect(next.targets.map((t) => t.platformId)).toEqual(["twitch", "kick"]);
  });

  it("syncTargetsToPlatforms is idempotent", () => {
    const once = ops.syncTargetsToPlatforms(base(), ["twitch", "kick"]);
    const twice = ops.syncTargetsToPlatforms(once, ["twitch", "kick"]);
    expect(twice.targets.map((t) => t.platformId)).toEqual(["twitch", "kick"]);
  });

  it("syncTargetsToPlatforms preserves requested creation order", () => {
    const next = ops.syncTargetsToPlatforms(base(), [
      "twitch",
      "youtube",
      "facebook",
      "kick",
    ]);
    expect(next.targets.map((t) => t.platformId)).toEqual([
      "twitch",
      "youtube",
      "facebook",
      "kick",
    ]);
  });

  it("addProfile skips occupied default profile names", () => {
    let c = base();
    c = ops.addProfile(c, "p2", (n) => `Perfil ${n}`);
    c = ops.renameProfile(c, "p2", "Perfil 3");
    c = ops.addProfile(c, "p3", (n) => `Perfil ${n}`);
    expect(c.profiles.find((p) => p.id === "p3")!.name).toBe("Perfil 4");
  });
});
