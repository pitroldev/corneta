import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  resolveConfig,
  runSourcemapCli,
  type PluginConfig,
} from "@posthog/plugin-utils";
import type { Plugin } from "vite";

const pairSizeLimit = 64 * 1024 * 1024;
const chunkId = /^\/\/# chunkId=[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\r?$/im;

function regularOutputPath(directory: string, name: string) {
  const path = resolve(directory, name);
  const local = relative(directory, path);
  if (
    !local ||
    isAbsolute(local) ||
    local === ".." ||
    local.startsWith(`..${sep}`)
  ) {
    throw new Error("Source-map output must stay inside the build directory.");
  }
  const stat = lstatSync(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    relative(path, realpathSync(path))
  ) {
    throw new Error(
      "Source-map processing requires regular output files without links.",
    );
  }
  return { path, size: stat.size };
}

export function posthogSourceMaps(options: PluginConfig): Plugin {
  if (options.sourcemaps?.enabled === false) {
    return { name: "corneta-posthog-source-maps", apply: "build" };
  }
  if (!options.cliBinaryPath) {
    throw new Error(
      "Source-map builds require POSTHOG_CLI_BINARY_PATH from scripts/fetch-posthog-cli.ps1.",
    );
  }
  const config = resolveConfig(options);
  return {
    name: "corneta-posthog-source-maps",
    apply: "build",
    config() {
      return {
        build: {
          sourcemap: config.sourcemaps.deleteAfterUpload ? "hidden" : true,
        },
      };
    },
    writeBundle: {
      order: "post",
      sequential: true,
      async handler(output, bundle) {
        if (!output.dir)
          throw new Error("Source-map processing requires a build directory.");
        const directory = resolve(output.dir);
        const directoryStat = lstatSync(directory);
        if (
          !directoryStat.isDirectory() ||
          directoryStat.isSymbolicLink() ||
          relative(directory, realpathSync(directory))
        ) {
          throw new Error(
            "Source-map processing requires a build directory without links.",
          );
        }
        // Vite emits worker chunks as assets; both need injection, upload, and cleanup.
        const entries = Object.entries(bundle).filter(([name]) =>
          /\.(?:mjs|cjs|js)$/.test(name),
        );
        if (!entries.length)
          throw new Error("No JavaScript outputs found for source-map upload.");
        const pairs = entries.map(([name, entry]) => {
          const javascript = regularOutputPath(directory, name);
          const map = regularOutputPath(directory, `${name}.map`);
          if (javascript.size + map.size > pairSizeLimit) {
            throw new Error(
              "Source-map pair exceeds the 64 MiB upload budget.",
            );
          }
          let sourceMap;
          try {
            sourceMap = JSON.parse(readFileSync(map.path, "utf8"));
          } catch {
            throw new Error("Source-map output must contain valid JSON.");
          }
          if (
            sourceMap?.version !== 3 ||
            !Array.isArray(sourceMap.sources) ||
            !sourceMap.sources.length ||
            !sourceMap.sources.every(
              (source: unknown) => typeof source === "string",
            ) ||
            typeof sourceMap.mappings !== "string" ||
            !sourceMap.mappings.length
          ) {
            throw new Error(
              "Every JavaScript output requires a nonempty version 3 source map.",
            );
          }
          return { entry, javascript: javascript.path, map: map.path };
        });
        await runSourcemapCli(config, {
          filePaths: pairs.map(({ javascript }) => javascript),
        });
        for (const { entry, javascript, map } of pairs) {
          const code = readFileSync(javascript, "utf8");
          if (
            !chunkId.test(code) ||
            (config.sourcemaps.deleteAfterUpload && existsSync(map))
          ) {
            throw new Error(
              "Source-map processing did not inject and clean every JavaScript output.",
            );
          }
          if (entry.type === "chunk") entry.code = code;
          else entry.source = code;
        }
      },
    },
  };
}
