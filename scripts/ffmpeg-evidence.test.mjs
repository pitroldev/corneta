import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import { collectionOptions } from "./collect-ffmpeg-evidence.mjs";
import { downloadReleaseSources } from "./release-source-download.mjs";
import {
  imageEvidence,
  packageFields,
  preserveArtifact,
  readPackageMetadata,
  sha256,
  validateArtifact,
} from "./ffmpeg-evidence.mjs";

const directories = [];
const temporary = () => {
  const directory = mkdtempSync(join(tmpdir(), "corneta-ffmpeg-evidence-"));
  directories.push(directory);
  return directory;
};
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (dirname(directory) !== tmpdir())
      throw new Error("Unexpected test cleanup directory.");
    rmSync(directory, { recursive: true, force: true });
  }
});

function tarMember(name, text, type = "0") {
  const body = Buffer.from(text);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100);
  header.write("0000644\0", 100);
  header.write(body.length.toString(8).padStart(11, "0") + "\0", 124);
  header.fill(32, 148, 156);
  header.write(type, 156);
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148);
  return Buffer.concat([
    header,
    body,
    Buffer.alloc((512 - (body.length % 512)) % 512),
  ]);
}
const pc = "opt/ffbuild/lib/pkgconfig/example.pc";
const packageText =
  "Name: example\nRequires:\nVersion: 1.2.3\nLibs: -lexample\n";
const artifact = (bytes, file = "source.tar.gz") => ({
  file,
  sha256: sha256(bytes),
  url: `https://source.example/commit-123/${file}`,
});

describe("FFmpeg evidence download boundary", () => {
  it("accepts only exact artifact identities and stable HTTPS URLs", () => {
    const valid = artifact(Buffer.from("fixture"));
    expect(() => validateArtifact(valid)).not.toThrow();
    for (const patch of [
      { file: "../outside" },
      { file: "/absolute" },
      { sha256: "bad" },
      { url: "https://source.example/latest/source.zip" },
      { url: "http://source.example/v1/a.zip" },
      { url: "https://user:pass@source.example/v1/a.zip" },
      { url: "https://source.example/v1/a.zip?token=example" },
    ]) {
      expect(() => validateArtifact({ ...valid, ...patch })).toThrow();
    }
  });

  it("downloads atomically, validates SHA, and supports verified offline reuse", async () => {
    const directory = temporary();
    const bytes = gzipSync(tarMember(pc, packageText));
    const source = artifact(bytes);
    const result = await preserveArtifact(source, directory, {
      fetchImpl: async () => new Response(bytes),
    });
    expect(result.cached).toBe(false);
    expect(readFileSync(join(directory, source.file))).toEqual(bytes);
    const cached = await preserveArtifact(source, directory, {
      offline: true,
      fetchImpl: () => {
        throw new Error("Network forbidden");
      },
    });
    expect(cached.cached).toBe(true);
    expect(readdirSync(directory)).toEqual([source.file]);
  });

  it("does not approve or replace corrupted cached files", async () => {
    const directory = temporary();
    const source = artifact(Buffer.from("expected"));
    writeFileSync(join(directory, source.file), "corrupted");
    await expect(
      preserveArtifact(source, directory, { offline: true }),
    ).rejects.toThrow("hash mismatch");
    expect(readFileSync(join(directory, source.file), "utf8")).toBe(
      "corrupted",
    );
  });

  it("rejects HTML returned with HTTP 200 even when someone pinned its hash", async () => {
    const directory = temporary();
    const bytes = Buffer.from("<!doctype html><title>Challenge</title>");
    const source = artifact(bytes);
    await expect(
      preserveArtifact(source, directory, {
        fetchImpl: async () => new Response(bytes),
      }),
    ).rejects.toThrow("archive format");
    expect(readdirSync(directory)).toEqual([]);
  });

  it("blocks the packaging download path on HTML before any source can be packaged", async () => {
    const directory = temporary();
    const bytes = Buffer.from("<!doctype html><title>Challenge</title>");
    await expect(
      downloadReleaseSources([artifact(bytes)], directory, {
        fetchImpl: async () => new Response(bytes),
      }),
    ).rejects.toThrow("archive format");
    expect(readdirSync(directory)).toEqual([]);
  });

  it("packages only verified archives and normalizes approved uppercase digests", async () => {
    const directory = temporary();
    const bytes = gzipSync(tarMember(pc, packageText));
    const source = artifact(bytes);
    await downloadReleaseSources(
      [{ ...source, sha256: source.sha256.toUpperCase() }],
      directory,
      {
        fetchImpl: async () => new Response(bytes),
      },
    );
    expect(readFileSync(join(directory, source.file))).toEqual(bytes);
  });

  it("rejects oversized responses, streams, total budgets, and wrong hashes", async () => {
    for (const mode of ["length", "stream", "budget", "hash"]) {
      const directory = temporary();
      const bytes = gzipSync(Buffer.alloc(1024, 1));
      const source = artifact(
        mode === "hash" ? Buffer.from("different") : bytes,
      );
      const options = {
        maxBytes: mode === "stream" ? 2 : 1024,
        budget: { remaining: mode === "budget" ? 2 : 1024 },
        fetchImpl: async () =>
          new Response(bytes, {
            headers: mode === "length" ? { "content-length": "999999" } : {},
          }),
      };
      await expect(
        preserveArtifact(source, directory, options),
      ).rejects.toThrow();
      expect(readdirSync(directory)).toEqual([]);
    }
  });

  it("fails offline before attempting unavailable evidence", async () => {
    await expect(
      preserveArtifact(artifact(Buffer.from("x")), temporary(), {
        offline: true,
      }),
    ).rejects.toThrow("offline");
  });

  it("does not expose execution, approval, upload or arbitrary output flags", () => {
    expect(collectionOptions(["--offline", "--preserve-binary"])).toMatchObject(
      { offline: true, preserveBinary: true },
    );
    for (const option of [
      "--approved",
      "--execute",
      "--publish",
      "--output=/",
      "--offline --offline",
    ]) {
      expect(() => collectionOptions(option.split(" "))).toThrow("Usage");
    }
  });
});

describe("passive TAR and pkg-config inspection", () => {
  it("never consumes Version as the value of an empty Requires field", () => {
    expect(packageFields(packageText)).toEqual({
      Name: "example",
      Requires: "",
      Version: "1.2.3",
      Libs: "-lexample",
    });
  });

  it("reads only regular metadata files without extracting symlinks or paths", async () => {
    const directory = temporary();
    const file = join(directory, "layer.gz");
    writeFileSync(
      file,
      gzipSync(
        Buffer.concat([
          tarMember("../../outside", "unwanted"),
          tarMember("opt/ffbuild/lib/pkgconfig/link.pc", "../../outside", "2"),
          tarMember(pc, packageText),
          Buffer.alloc(1024),
        ]),
      ),
    );
    const entries = await readPackageMetadata(file);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ file: pc, Version: "1.2.3" });
    expect(readdirSync(directory)).toEqual(["layer.gz"]);
  });

  it("fails on bad TAR checksums and truncated TAR members", async () => {
    for (const mode of ["checksum", "truncated"]) {
      const file = join(temporary(), "bad.gz");
      const member = tarMember(pc, packageText);
      if (mode === "checksum") member[0] ^= 1;
      writeFileSync(
        file,
        gzipSync(mode === "truncated" ? member.subarray(0, 520) : member),
      );
      await expect(readPackageMetadata(file)).rejects.toThrow();
    }
  });

  it("caps expanded bytes and retained metadata", async () => {
    const file = join(temporary(), "large.gz");
    writeFileSync(file, gzipSync(tarMember(pc, packageText)));
    await expect(
      readPackageMetadata(file, { maximumExpanded: 10 }),
    ).rejects.toThrow("byte limit");
    await expect(
      readPackageMetadata(file, { maximumMetadata: 10 }),
    ).rejects.toThrow("exceeds limit");
  });
});

describe("OCI correspondence identity", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  const configDigest = `sha256:${"b".repeat(64)}`;
  const provenance = { image: { configDigest, dependencyLayerDigest: digest } };
  const manifest = {
    schemaVersion: 2,
    config: { digest: configDigest },
    layers: [{ digest, size: 10 }],
  };
  const configuration = {
    os: "linux",
    architecture: "amd64",
    created: "2026-08-19",
    history: [
      { created_by: "ENV EXAMPLE=value", empty_layer: true },
      { created_by: "COPY /opt/ffbuild/. /opt/ffbuild # buildkit" },
    ],
    config: { Env: ["FF_CONFIGURE=--enable-gpl"] },
  };

  it("maps only non-empty history to the matching dependency layer", () => {
    expect(imageEvidence(manifest, configuration, provenance)).toMatchObject({
      layerCount: 1,
      totalCompressedBytes: 10,
      configure: "--enable-gpl",
    });
  });
  it("refuses mismatched platform, config digest or layer mapping", () => {
    for (const patch of [
      { os: "windows" },
      { architecture: "arm64" },
      { history: [] },
    ])
      expect(() =>
        imageEvidence(manifest, { ...configuration, ...patch }, provenance),
      ).toThrow();
    expect(() =>
      imageEvidence(
        { ...manifest, config: { digest } },
        configuration,
        provenance,
      ),
    ).toThrow();
  });
});
