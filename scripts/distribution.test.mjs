import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  compareVersions,
  releaseIdentity,
  updateChocolatey,
  updateScoop,
  validateDownloads,
} from "./distribution.mjs";

const folders = [];
afterEach(() =>
  folders
    .splice(0)
    .forEach((folder) => rmSync(folder, { recursive: true, force: true })),
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const url = "https://github.com/pitroldev/corneta/releases/download/v1.2.3/";
const installer = "Corneta_1.2.3_x64-setup.exe";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "corneta-distribution-"));
  folders.push(directory);
  const files = {
    [installer]: "synthetic installer bytes",
    [installer + ".sig"]: "synthetic signature",
    "latest.json": JSON.stringify({
      version: "1.2.3",
      platforms: {
        "windows-x86_64": {
          url: url + installer,
          signature: "synthetic signature",
        },
      },
    }),
    "corneta-third-party.zip": "synthetic compliance archive",
  };
  files["SHA256SUMS.txt"] =
    Object.entries(files)
      .map(([name, bytes]) => hash(bytes) + "  " + name)
      .join("\n") + "\n";
  for (const [name, bytes] of Object.entries(files))
    writeFileSync(join(directory, name), bytes);
  const release = {
    id: 123,
    tag_name: "v1.2.3",
    draft: false,
    prerelease: false,
    published_at: "2026-11-01T12:00:00Z",
    assets: Object.entries(files).map(([name, bytes]) => ({
      name,
      state: "uploaded",
      size: Buffer.byteLength(bytes),
      digest: "sha256:" + hash(bytes),
      browser_download_url: url + name,
    })),
  };
  return { directory, release };
}

describe("distribution input boundaries", () => {
  it("accepts a stable release with exact hashes and matching updater metadata", () => {
    const { directory, release } = fixture();
    expect(validateDownloads(releaseIdentity(release), directory)).toBe(
      hash("synthetic installer bytes"),
    );
  });

  it.each(["1.2.3-beta", "1.2.3\nmalicious=true", "../main", "01.2.3"])(
    "rejects nonstable or injected version %s",
    (version) => {
      const { release } = fixture();
      release.tag_name = "v" + version;
      expect(() => releaseIdentity(release)).toThrow();
    },
  );

  it("rejects drafts, prereleases, missing assets, foreign URLs, and absent digests", () => {
    for (const mutate of [
      (release) => {
        release.draft = true;
      },
      (release) => {
        release.prerelease = true;
      },
      (release) => {
        release.assets.pop();
      },
      (release) => {
        release.assets.push(release.assets[0]);
      },
      (release) => {
        release.assets[0].browser_download_url =
          "https://example.org/setup.exe";
      },
      (release) => {
        release.assets[0].digest = null;
      },
    ]) {
      const { release } = fixture();
      mutate(release);
      expect(() => releaseIdentity(release)).toThrow();
    }
  });

  it("rejects tampered downloads even if the local checksum list was also changed", () => {
    const { directory, release } = fixture();
    writeFileSync(join(directory, installer), "tampered");
    writeFileSync(
      join(directory, "SHA256SUMS.txt"),
      hash("tampered") + "  " + installer,
    );
    expect(() =>
      validateDownloads(releaseIdentity(release), directory),
    ).toThrow(/differ/);
  });

  it("rejects a checksum-list mismatch even when the API digest matches the list", () => {
    const { directory, release } = fixture();
    const path = join(directory, "SHA256SUMS.txt");
    const wrong = readFileSync(path, "utf8").replace(
      hash("synthetic installer bytes"),
      "0".repeat(64),
    );
    writeFileSync(path, wrong);
    Object.assign(
      release.assets.find((asset) => asset.name === "SHA256SUMS.txt"),
      { digest: "sha256:" + hash(wrong), size: Buffer.byteLength(wrong) },
    );
    expect(() =>
      validateDownloads(releaseIdentity(release), directory),
    ).toThrow(/checksum mismatch/);
  });
});

describe("package version synchronization", () => {
  const release = {
    tag: "v1.2.3",
    version: "1.2.3",
    url: url + installer,
    sha256: "a".repeat(64),
  };

  it("compares numeric versions without lexicographic downgrade mistakes", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
  });

  it("updates Scoop without changing installation or data-preservation behavior", () => {
    const manifest = {
      version: "1.2.2",
      architecture: { "64bit": { url: "old", hash: "old" } },
      installer: { script: "preserved" },
    };
    expect(updateScoop(manifest, release)).toBe(true);
    expect(manifest.installer.script).toBe("preserved");
    expect(manifest.architecture["64bit"].hash).toBe(release.sha256);
    expect(updateScoop(manifest, release)).toBe(false);
    expect(() =>
      updateScoop(manifest, { ...release, sha256: "b".repeat(64) }),
    ).toThrow(/different bytes/);
    expect(() =>
      updateScoop(manifest, { ...release, version: "1.2.2" }),
    ).toThrow(/downgrade/);
  });

  it("updates Chocolatey versioned URLs and checksum without changing install commands", () => {
    const spec =
      "<version>1.2.2</version><licenseUrl>https://github.com/pitroldev/corneta/blob/v1.2.2/LICENSE</licenseUrl><releaseNotes>old</releaseNotes>";
    const script =
      "url64bit = 'old'\nchecksum64 = 'old'\nInstall-ChocolateyPackage @packageArgs";
    const result = updateChocolatey(spec, script, release);
    expect(result.changed).toBe(true);
    expect(result.nuspec).toContain("/v1.2.3/LICENSE");
    expect(result.installer).toContain(
      "Install-ChocolateyPackage @packageArgs",
    );
    expect(
      updateChocolatey(result.nuspec, result.installer, release).changed,
    ).toBe(false);
    expect(() =>
      updateChocolatey(result.nuspec, result.installer, {
        ...release,
        version: "1.2.2",
      }),
    ).toThrow(/downgrade/);
    expect(() =>
      updateChocolatey(spec, script + "\nchecksum64 = 'duplicate'", release),
    ).toThrow(/template/);
  });
});
