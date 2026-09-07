import { describe, expect, it } from "vitest";
// @ts-expect-error Node release tooling intentionally uses dependency-free ESM.
import { complianceErrors } from "./release-compliance.mjs";

const sha = "a".repeat(64);
const sidecars = { ffmpeg: { verified: true, archiveSha256: sha } };
const manifest = {
  schemaVersion: 1,
  reviewed: true,
  ffmpegArchiveSha256: sha,
  sources: [
    {
      file: "sources.tar.xz",
      sha256: "b".repeat(64),
      url: "https://downloads.example.org/v1/sources.tar.xz",
    },
  ],
};

describe("release source compliance gate", () => {
  it("accepts a reviewed manifest matching the verified FFmpeg archive", () =>
    expect(complianceErrors(manifest, sidecars)).toEqual([]));
  it("blocks an unreviewed or empty package", () =>
    expect(
      complianceErrors({ ...manifest, reviewed: false, sources: [] }, sidecars),
    ).toHaveLength(2));
  it("blocks sources for another FFmpeg build", () =>
    expect(
      complianceErrors(
        { ...manifest, ffmpegArchiveSha256: "c".repeat(64) },
        sidecars,
      ),
    ).toHaveLength(1));
  it.each(["../sources.zip", "sources.exe", "C:/sources.zip"])(
    "rejects unsafe artifact names: %s",
    (file) =>
      expect(
        complianceErrors(
          { ...manifest, sources: [{ ...manifest.sources[0], file }] },
          sidecars,
        ).length,
      ).toBeGreaterThan(0),
  );
  it("rejects moving URLs and credentials", () => {
    for (const url of [
      "https://host.test/latest/source.zip",
      "https://secret@host.test/v1/source.zip",
    ])
      expect(
        complianceErrors(
          { ...manifest, sources: [{ ...manifest.sources[0], url }] },
          sidecars,
        ).length,
      ).toBeGreaterThan(0);
  });
});
