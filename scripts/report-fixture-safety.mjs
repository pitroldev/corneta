import { createHash } from "node:crypto";
import {
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  utimesSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export function assertNoFixtureLinks(target) {
  let current = resolve(target);
  for (;;) {
    let stat;
    try {
      // existsSync follows the link first and misses dangling links. lstat
      // sees the link itself, including a junction whose target is gone.
      stat = lstatSync(current);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (stat?.isSymbolicLink()) {
      throw new Error("Fixtures recusam symlinks/junctions no destino.");
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export function fixtureHash(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export function copyFixtureExclusive(source, destination) {
  assertNoFixtureLinks(source);
  assertNoFixtureLinks(destination);
  const stat = lstatSync(source);
  if (!stat.isFile())
    throw new Error("A origem do fixture não é um arquivo regular.");
  // Never replace a path created by another process after preflight.
  copyFileSync(source, destination, constants.COPYFILE_EXCL);
  utimesSync(destination, stat.atime, stat.mtime);
}

export function preflightFixtureOutputs(manifest, root, names) {
  const previous = new Set(
    manifest
      ? validateFixtureManifest(manifest, root).map((file) => resolve(file))
      : [],
  );
  const output = new Set();
  const sessions = resolve(root, "sessions");
  for (const name of names) {
    if (
      typeof name !== "string" ||
      !/^\d{1,20}(?:\.chat\.ndjson|\.ndjson|(?:\.p\d+)?\.mp4)$/.test(name)
    ) {
      throw new Error("Nome de fixture inválido.");
    }
    const file = resolve(sessions, name);
    if (output.has(file))
      throw new Error("ID de fixture duplicado; dados preservados.");
    assertNoFixtureLinks(file);
    if (existsSync(file) && !previous.has(file)) {
      throw new Error(
        "ID de fixture colidiu com arquivo preexistente; dados preservados.",
      );
    }
    output.add(file);
  }
  return [...output];
}

export function validateFixtureManifest(manifest, root) {
  const sessions = resolve(root, "sessions");
  if (
    manifest?.schemaVersion !== 2 ||
    manifest.sessionsDir !== sessions ||
    !Array.isArray(manifest.generatedFiles)
  ) {
    throw new Error(
      "Manifesto de fixtures incompatível; dados preservados. Use uma pasta descartável nova.",
    );
  }
  const files = new Set();
  for (const file of manifest.generatedFiles) {
    if (typeof file !== "string" || !isAbsolute(file))
      throw new Error("Caminho de fixture inválido.");
    const name = relative(sessions, file);
    if (
      isAbsolute(name) ||
      name.includes(sep) ||
      !/^\d{1,20}(?:\.chat\.ndjson|\.ndjson|(?:\.p\d+)?\.mp4)$/.test(name) ||
      files.has(file)
    ) {
      throw new Error(
        "Manifesto aponta para arquivo externo ou duplicado; dados preservados.",
      );
    }
    assertNoFixtureLinks(file);
    if (
      existsSync(file) &&
      (!lstatSync(file).isFile() ||
        manifest.generatedHashes?.[name] !== fixtureHash(file))
    ) {
      throw new Error(
        "Um fixture foi modificado; limpeza recusada para preservar os dados.",
      );
    }
    files.add(file);
  }
  if (
    typeof manifest.backupDir !== "string" ||
    !/^sessions-backup-before-fixtures-[\dTZ-]+$/.test(
      relative(resolve(root), manifest.backupDir),
    )
  ) {
    throw new Error("Backup de fixtures fora do destino esperado.");
  }
  assertNoFixtureLinks(manifest.backupDir);
  return [...files];
}
