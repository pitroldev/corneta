#!/usr/bin/env node
// pnpm bump <patch|minor|major> [X.Y.Z] [--commit]
// Predictable conflicts are rejected before writes. Git/hook failures preserve
// the version changes for inspection; never reset user data to simulate rollback.
import {
  readFileSync,
  writeFileSync,
  existsSync,
  lstatSync,
  renameSync,
  unlinkSync,
  openSync,
  closeSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
function versionParts(version) {
  if (!versionPattern.test(version))
    throw new Error("Versão inválida: esperado X.Y.Z sem zeros à esquerda.");
  const values = version.split(".").map(Number);
  if (values.some((value) => !Number.isSafeInteger(value)))
    throw new Error("Versão excede o limite inteiro seguro.");
  return values;
}

export function bumpOptions(args, current) {
  const positional = args.filter((arg) => !arg.startsWith("--"));
  if (
    args.some((arg) => arg.startsWith("--") && arg !== "--commit") ||
    args.filter((arg) => arg === "--commit").length > 1 ||
    !["patch", "minor", "major"].includes(positional[0]) ||
    positional.length > 2
  )
    throw new Error("Uso: pnpm bump <patch|minor|major> [X.Y.Z] [--commit]");
  const previous = versionParts(current);
  const parts = [...previous];
  const index = { major: 0, minor: 1, patch: 2 }[positional[0]];
  parts[index]++;
  for (let at = index + 1; at < parts.length; at++) parts[at] = 0;
  const version = positional[1] ?? parts.join(".");
  const next = versionParts(version);
  const difference = next.findIndex((part, at) => part !== previous[at]);
  if (difference < 0 || next[difference] < previous[difference])
    throw new Error("A nova versão precisa ser maior que a atual.");
  return { version, commit: args.includes("--commit") };
}

export function bumpVersion(
  root,
  args,
  { gitEnv = process.env, replaceFile = renameSync } = {},
) {
  const env = { ...gitEnv };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
  ])
    delete env[key];
  const git = (arguments_, allowed = [0]) => {
    const result = spawnSync("git", arguments_, {
      cwd: root,
      env,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    if (result.error || !allowed.includes(result.status))
      throw new Error(
        `Git falhou em ${arguments_[0]}; confira o estado do repositório.`,
      );
    return result;
  };
  if (
    resolve(git(["rev-parse", "--show-toplevel"]).stdout.trim()) !==
    resolve(root)
  )
    throw new Error("Execute bump na raiz do repositório.");
  const packagePath = join(root, "package.json");
  const current = JSON.parse(readFileSync(packagePath, "utf8")).version;
  const options = bumpOptions(args, current);
  const tag = `v${options.version}`;
  const targets = [
    ["package.json", /("version"\s*:\s*")([^"\r\n]+)(")/],
    ["src-tauri/tauri.conf.json", /("version"\s*:\s*")([^"\r\n]+)(")/],
    [
      "src-tauri/Cargo.toml",
      /(\[package\][\s\S]*?^version\s*=\s*")([^"\r\n]+)(")/m,
    ],
  ];
  if (existsSync(join(root, "src-tauri/Cargo.lock")))
    targets.push([
      "src-tauri/Cargo.lock",
      /(name = "corneta"\r?\nversion = ")([^"\r\n]+)(")/,
    ]);
  const writes = targets.map(([file, expression]) => {
    const path = join(root, file);
    for (let at = path; at !== dirname(at); at = dirname(at))
      if (lstatSync(at).isSymbolicLink())
        throw new Error("Alvos de versão não podem atravessar links.");
    const original = readFileSync(path, "utf8");
    const match = expression.exec(original);
    if (!match || match[2] !== current)
      throw new Error(
        `Versão ausente/divergente em ${file}; nada foi escrito.`,
      );
    return {
      file,
      path,
      original,
      updated: original.replace(
        expression,
        (_all, prefix, _version, suffix) =>
          `${prefix}${options.version}${suffix}`,
      ),
    };
  });
  const files = writes.map(({ file }) => file);
  git(["ls-files", "--error-unmatch", "--", ...files]);
  if (git(["diff", "--cached", "--quiet", "--exit-code"], [0, 1]).status !== 0)
    throw new Error(
      "Index contém alterações staged; finalize-as antes de bump.",
    );
  if (
    git([
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--",
      ...files,
    ]).stdout.trim()
  )
    throw new Error(
      "Arquivos de versão têm alterações locais; finalize-as antes de bump.",
    );
  if (
    git(["show-ref", "--verify", "--quiet", `refs/tags/${tag}`], [0, 1])
      .status === 0
  )
    throw new Error(`A tag ${tag} já existe; nada foi escrito.`);
  if (options.commit) {
    git(["symbolic-ref", "--quiet", "HEAD"]);
    git(["var", "GIT_AUTHOR_IDENT"]);
    git(["var", "GIT_COMMITTER_IDENT"]);
  }
  // Complete temporary files precede replacement. A filesystem failure restores
  // only bytes still owned by this operation, never concurrent edits.
  const staged = [];
  const replaced = [];
  let failure;
  try {
    for (const write of writes) {
      write.temporary = `${write.path}.bump-${randomUUID()}`;
      const descriptor = openSync(
        write.temporary,
        "wx",
        lstatSync(write.path).mode,
      );
      staged.push(write);
      try {
        writeFileSync(descriptor, write.updated);
      } finally {
        closeSync(descriptor);
      }
    }
    for (const write of staged) {
      if (readFileSync(write.path, "utf8") !== write.original)
        throw new Error("Um alvo mudou durante bump; operação interrompida.");
      replaceFile(write.temporary, write.path);
      replaced.push(write);
    }
  } catch (error) {
    let restored = true;
    for (const write of replaced.reverse()) {
      try {
        if (readFileSync(write.path, "utf8") !== write.updated) {
          restored = false;
          continue;
        }
        writeFileSync(write.path, write.original);
      } catch {
        restored = false;
      }
    }
    failure = new Error(
      `${error.message} ${restored ? "Escritas próprias revertidas." : "Recuperação parcial: revise git diff; não execute reset destrutivo."}`,
    );
  }
  for (const write of staged) {
    try {
      if (existsSync(write.temporary)) unlinkSync(write.temporary);
    } catch {
      failure ??= new Error(
        "Não foi possível limpar arquivos .bump-* desta operação; revise o estado antes de continuar.",
      );
    }
  }
  if (failure) throw failure;
  if (options.commit) {
    try {
      // --only prevents an unrelated concurrently staged file entering this commit.
      git(["commit", "--only", "-m", `chore: ${tag}`, "--", ...files]);
      git(["tag", "--", tag]);
    } catch {
      throw new Error(
        `Versões ${options.version} preservadas, mas commit/tag não concluídos. Confira git status, git diff e git log -1; finalize o commit e a tag ${tag} manualmente após revisão. Nada foi resetado.`,
      );
    }
  }
  return { from: current, ...options, files };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = bumpVersion(
      resolve(dirname(fileURLToPath(import.meta.url)), ".."),
      process.argv.slice(2),
    );
    console.log(
      `Versão: ${result.from} → ${result.version}. ${result.commit ? "Commit e tag criados." : "Revise e commite as alterações."}`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
