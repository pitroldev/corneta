// Evidence collection only. Never executes vendor code or approves a release.
import { createHash } from "node:crypto";
import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

export const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

export function assertArchiveMagic(file, name = basename(file)) {
  const expected = name.endsWith(".tar.gz")
    ? [0x1f, 0x8b]
    : name.endsWith(".tar.xz")
      ? [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]
      : name.endsWith(".zip")
        ? [0x50, 0x4b, 0x03, 0x04]
        : null;
  if (!expected) return;
  const descriptor = openSync(file, "r");
  const prefix = Buffer.alloc(expected.length);
  try {
    if (
      readSync(descriptor, prefix, 0, prefix.length, 0) !== prefix.length ||
      expected.some((byte, index) => prefix[index] !== byte)
    ) {
      throw new Error(`Response is not the expected archive format: ${name}`);
    }
  } finally {
    closeSync(descriptor);
  }
}

export function validateArtifact(source) {
  if (
    !source ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/.test(source.file ?? "") ||
    !/^[a-f0-9]{64}$/.test(source.sha256 ?? "")
  )
    throw new Error("Invalid evidence identity.");
  const url = new URL(source.url);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /\/(?:latest|main|master)(?:\/|$)/.test(url.pathname)
  ) {
    throw new Error(
      "Evidence requires an immutable HTTPS URL without credentials.",
    );
  }
}

export async function hashFile(file, maxBytes = MAX_ARTIFACT_BYTES) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) {
    throw new Error("Evidence file must be regular and within the byte limit.");
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return { sha256: hash.digest("hex"), bytes: stat.size };
}

export async function preserveArtifact(source, directory, options = {}) {
  validateArtifact(source);
  const {
    offline = false,
    maxBytes = MAX_ARTIFACT_BYTES,
    fetchImpl = fetch,
    headers = {},
  } = options;
  const consume = (bytes) => {
    if (!options.budget) return;
    options.budget.remaining -= bytes;
    if (options.budget.remaining < 0)
      throw new Error("Evidence collection exceeds its total byte budget.");
  };
  mkdirSync(directory, { recursive: true });
  const actualDirectory = realpathSync(directory);
  const expectedDirectory = resolve(directory);
  if (
    process.platform === "win32"
      ? actualDirectory.toLowerCase() !== expectedDirectory.toLowerCase()
      : actualDirectory !== expectedDirectory
  )
    throw new Error("Evidence storage cannot traverse symlinks/junctions.");
  const destination = join(directory, source.file);
  if (existsSync(destination)) {
    const existing = await hashFile(destination, maxBytes);
    if (existing.sha256 !== source.sha256)
      throw new Error(`Cached evidence hash mismatch: ${source.file}`);
    assertArchiveMagic(destination, source.file);
    consume(existing.bytes);
    return { ...source, ...existing, cached: true };
  }
  if (offline)
    throw new Error(`Evidence missing in offline mode: ${source.file}`);
  const staging = mkdtempSync(join(directory, ".download-"));
  if (
    dirname(resolve(staging)) !== resolve(directory) ||
    !basename(staging).startsWith(".download-")
  ) {
    throw new Error("Evidence cleanup escaped its staging directory.");
  }
  let result;
  let failure;
  try {
    const response = await fetchImpl(source.url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(180_000),
    });
    if (
      !response.ok ||
      !response.body ||
      (response.url && new URL(response.url).protocol !== "https:")
    ) {
      throw new Error(`Evidence download failed: ${source.file}`);
    }
    if (Number(response.headers.get("content-length")) > maxBytes) {
      await response.body.cancel();
      throw new Error("Evidence download exceeds byte limit.");
    }
    let bytes = 0;
    const hash = createHash("sha256");
    const guard = new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > maxBytes)
          return callback(new Error("Evidence stream exceeds byte limit."));
        try {
          consume(chunk.length);
        } catch (error) {
          return callback(error);
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    const partial = join(staging, "artifact.part");
    await pipeline(
      Readable.fromWeb(response.body),
      guard,
      createWriteStream(partial, { flags: "wx" }),
    );
    if (hash.digest("hex") !== source.sha256)
      throw new Error(`Evidence download hash mismatch: ${source.file}`);
    assertArchiveMagic(partial, source.file);
    renameSync(partial, destination);
    result = { ...source, bytes, cached: false };
  } catch (error) {
    failure = error;
  }
  try {
    rmSync(staging, { recursive: true, force: true });
  } catch (cleanupError) {
    // Preserve the original download/hash error if cleanup also failed.
    failure ??= cleanupError;
  }
  if (failure) throw failure;
  return result;
}

export function imageEvidence(manifest, configuration, provenance) {
  const digest = (value) => /^sha256:[a-f0-9]{64}$/.test(value ?? "");
  if (
    manifest.schemaVersion !== 2 ||
    !Array.isArray(manifest.layers) ||
    manifest.config?.digest !== provenance.image.configDigest ||
    configuration.os !== "linux" ||
    configuration.architecture !== "amd64"
  ) {
    throw new Error(
      "OCI image identity/platform diverges from the pinned build.",
    );
  }
  const history = (configuration.history ?? []).filter(
    (entry) => !entry.empty_layer,
  );
  if (history.length !== manifest.layers.length)
    throw new Error("OCI history/layer mapping is ambiguous.");
  const layers = manifest.layers.map((layer, index) => {
    if (
      !digest(layer.digest) ||
      !Number.isSafeInteger(layer.size) ||
      layer.size < 0
    ) {
      throw new Error("Invalid OCI layer descriptor.");
    }
    return {
      digest: layer.digest,
      bytes: layer.size,
      created: history[index].created,
      operation: history[index].created_by,
    };
  });
  const dependencyLayer = layers.find(
    (layer) => layer.digest === provenance.image.dependencyLayerDigest,
  );
  if (
    !dependencyLayer ||
    !/^COPY \/opt\/ffbuild\/\. \/opt\/ffbuild(?: |$)/.test(
      dependencyLayer.operation ?? "",
    )
  ) {
    throw new Error(
      "Pinned dependency layer is not the expected vendor COPY layer.",
    );
  }
  return {
    created: configuration.created,
    layerCount: layers.length,
    totalCompressedBytes: layers.reduce((sum, layer) => sum + layer.bytes, 0),
    dependencyLayer,
    configure: configuration.config?.Env?.find((value) =>
      value.startsWith("FF_CONFIGURE="),
    )?.slice(13),
    layers,
  };
}

// Bound decompression and retain only regular pkg-config members; never extract vendor paths.
export async function readTarText(archive, limits = {}) {
  const maximumExpanded = limits.maximumExpanded ?? 2 * 1024 * 1024 * 1024;
  const maximumMetadata = limits.maximumMetadata ?? 8 * 1024 * 1024;
  const acceptFile =
    limits.acceptFile ??
    ((file) =>
      /^opt\/ffbuild\/(?:lib|share)\/pkgconfig\/[^/]+\.pc$/.test(file));
  const entries = [];
  let expanded = 0,
    metadata = 0,
    header = Buffer.alloc(0),
    member = null;
  let pendingPath = null;
  const input = createReadStream(archive);
  const stream = input.pipe(createGunzip());
  input.on("error", (error) => stream.destroy(error));
  try {
    for await (const chunk of stream) {
      expanded += chunk.length;
      if (expanded > maximumExpanded)
        throw new Error("Expanded layer exceeds byte limit.");
      let offset = 0;
      while (offset < chunk.length) {
        if (!member) {
          const length = Math.min(512 - header.length, chunk.length - offset);
          header = Buffer.concat([
            header,
            chunk.subarray(offset, offset + length),
          ]);
          offset += length;
          if (header.length < 512) continue;
          if (header.every((byte) => byte === 0)) {
            header = Buffer.alloc(0);
            continue;
          }
          const field = (from, to) =>
            header
              .subarray(from, to)
              .toString("utf8")
              .replace(/\0.*$/s, "")
              .trim();
          const checksum = [...header].reduce(
            (sum, byte, index) =>
              sum + (index >= 148 && index < 156 ? 32 : byte),
            0,
          );
          if (checksum !== Number.parseInt(field(148, 156), 8))
            throw new Error("Invalid TAR header checksum.");
          const sizeText = field(124, 136);
          if (!/^[0-7]+$/.test(sizeText))
            throw new Error("Unsupported TAR size encoding.");
          const size = Number.parseInt(sizeText, 8);
          const type = field(156, 157) || "0";
          const prefix = field(345, 500);
          const file =
            pendingPath || `${prefix ? `${prefix}/` : ""}${field(0, 100)}`;
          pendingPath = null;
          if (!["0", "5", "1", "2", "x", "g", "L", "K"].includes(type))
            throw new Error("Unsupported TAR member type.");
          const collect = type === "0" && acceptFile(file);
          const special = ["x", "g", "L", "K"].includes(type);
          if ((collect || special) && size > 128 * 1024)
            throw new Error("TAR metadata member exceeds byte limit.");
          member = {
            file,
            type,
            size,
            remaining: size,
            padding: (512 - (size % 512)) % 512,
            collect,
            special,
            chunks: [],
          };
          header = Buffer.alloc(0);
        }
        if (member.remaining) {
          const length = Math.min(member.remaining, chunk.length - offset);
          if (member.collect || member.special)
            member.chunks.push(chunk.subarray(offset, offset + length));
          offset += length;
          member.remaining -= length;
          if (member.remaining) continue;
        }
        if (member.padding) {
          const length = Math.min(member.padding, chunk.length - offset);
          offset += length;
          member.padding -= length;
          if (member.padding) continue;
        }
        const text = Buffer.concat(member.chunks).toString("utf8");
        if (member.special) {
          if (member.type === "L")
            pendingPath = text.replace(/\0.*$/s, "").trim();
          else if (member.type === "x" || member.type === "g") {
            if (/\d+ (?:size|GNU\.sparse\.[^=]+)=/.test(text))
              throw new Error("Unsupported TAR extended size/sparse metadata.");
            const path = text.match(/(?:^|\n)\d+ path=([^\n]+)/)?.[1];
            if (member.type === "g" && path)
              throw new Error("Unsupported global TAR path override.");
            pendingPath = path || null;
          }
        }
        if (member.collect) {
          metadata += member.size;
          if (metadata > maximumMetadata || entries.length >= 256)
            throw new Error("Package metadata inventory exceeds limit.");
          entries.push({
            file: member.file,
            sha256: sha256(Buffer.concat(member.chunks)),
            text,
          });
        }
        member = null;
      }
    }
    if (member || header.length) throw new Error("Truncated TAR stream.");
  } finally {
    input.destroy();
    stream.destroy();
  }
  if (!entries.length)
    throw new Error("No requested metadata found in the verified archive.");
  return entries;
}

export function packageFields(text) {
  // Spaces, not \s: an empty Requires line must never consume Version below it.
  return Object.fromEntries(
    [
      ...text.matchAll(
        /^(Name|Version|Requires(?:\.private)?|Libs(?:\.private)?):[ \t]*(.*)$/gm,
      ),
    ].map((match) => [match[1], match[2].trim()]),
  );
}

export async function readPackageMetadata(archive, limits) {
  return (await readTarText(archive, limits)).map((entry) => ({
    ...entry,
    ...packageFields(entry.text),
  }));
}

export async function readRecipeMetadata(archive, commit) {
  if (!/^[a-f0-9]{40}$/.test(commit))
    throw new Error("Recipe commit must be immutable.");
  const prefix = `FFmpeg-Builds-${commit}/`;
  const entries = await readTarText(archive, {
    acceptFile: (file) =>
      file.startsWith(prefix) &&
      /^scripts\.d\/.+\.sh$/.test(file.slice(prefix.length)),
  });
  return entries.map(({ file, sha256: digest, text }) => ({
    file: file.slice(prefix.length),
    sha256: digest,
    definitions: Object.fromEntries(
      [
        ...text.matchAll(
          /^(SCRIPT_(?:REPO|COMMIT|REV|TAG)\d*)=["']([^"'\n]+)["']/gm,
        ),
      ].map((match) => [match[1], match[2]]),
    ),
    extraSourceMechanisms: [
      ...new Set(
        [
          ...text.matchAll(
            /git submodule|git-sync-deps|cargo update|gnulib|SCRIPT_(?:REPO|COMMIT)[2-9]/g,
          ),
        ].map((match) => match[0]),
      ),
    ],
    status: "recipe-candidate-not-proof-of-binary-inclusion",
  }));
}
