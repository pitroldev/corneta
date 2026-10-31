import { describe, expect, it } from "vitest";
import { msixVersion, storeEnvironment, storeManifest } from "./store-msix.mjs";

describe("Microsoft Store package boundary", () => {
  it("rejects prereleases, XML injection, and invalid Windows versions", () => {
    expect(msixVersion("0.13.1")).toBe("0.13.1.0");
    for (const version of [
      "1.0.0-beta",
      "1.2.3.4",
      "1.0.65536",
      '1.0.0"',
      "1.00.0",
      "-1.0.0",
    ])
      expect(() => msixVersion(version)).toThrow();
  });

  it("keeps credentials, contributor mode, and external build overrides out of the Store executable", () => {
    const env = storeEnvironment({
      Path: "toolchain",
      KICK_CLIENT_SECRET: "secret-value",
      VITE_CONTRIBUTOR: "1",
      CORNETA_CONTRIBUTOR: "1",
      NODE_OPTIONS: "unsafe-hook",
      RUSTFLAGS: "unsafe-override",
      TAURI_CONFIG: "unsafe-override",
    });
    expect(Object.values(env)).not.toContain("secret-value");
    expect(Object.values(env)).not.toContain("unsafe-override");
    expect(env.CORNETA_CONTRIBUTOR).toBeUndefined();
    expect(env.VITE_CONTRIBUTOR).toBeUndefined();
    expect(env.CORNETA_STORE).toBe("1");
    expect(env.VITE_STORE).toBe("1");
    expect(env.TELEMETRY_DISABLED).toBe("1");
    expect(env.VITE_SETUP_API_URL).toBe("https://www.corneta.live");
  });

  it("declares the reserved identity and opt-in startup without elevation", () => {
    const manifest = storeManifest("0.13.1");
    expect(manifest).toContain('Name="pitroldev.Corneta"');
    expect(manifest).toContain(
      'Publisher="CN=CA9298D5-25D1-490F-8BFE-5807D0ACE4EC"',
    );
    expect(manifest).toContain('Version="0.13.1.0"');
    expect(manifest).toContain('TaskId="CornetaStartup" Enabled="false"');
    expect(manifest).toContain('uap10:Parameters="--autostart"');
    expect(manifest).not.toContain("allowElevation");
  });
});
