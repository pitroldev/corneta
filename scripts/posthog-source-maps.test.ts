import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  truncateSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { build, type Plugin } from "vite";
import { runSourcemapCli, type PluginConfig } from "@posthog/plugin-utils";
import { posthogSourceMaps } from "./posthog-source-maps";

vi.mock("@posthog/plugin-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@posthog/plugin-utils")>()),
  runSourcemapCli: vi.fn(),
}));

const cli = vi.mocked(runSourcemapCli);
const marker = "//# chunkId=11111111-1111-4111-8111-111111111111";
const javascript = /\.(?:js|mjs|cjs)$/;
const temporaryParent = realpathSync(tmpdir());
const directories: string[] = [];
const options: PluginConfig = {
  personalApiKey: "synthetic-only-not-a-credential",
  projectId: "1234",
  host: "https://posthog.example.invalid",
  cliBinaryPath: "synthetic-posthog-cli-never-run",
  logLevel: "silent",
  sourcemaps: {
    enabled: true,
    releaseName: "synthetic-desktop",
    releaseVersion: "0.0.0",
    build: "synthetic-build",
    deleteAfterUpload: true,
  },
};
const sourceMap = JSON.stringify({
  version: 3,
  mappings: "AAAA",
  sources: ["input.ts"],
  sourcesContent: ["export const value = 1;"],
  names: [],
});

beforeEach(() => {
  cli.mockReset();
});
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (
      dirname(directory) !== temporaryParent ||
      !basename(directory).startsWith("corneta-source-maps-") ||
      realpathSync(directory) !== directory
    ) {
      throw new Error("Unexpected source-map fixture cleanup directory.");
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporary() {
  const directory = mkdtempSync(join(temporaryParent, "corneta-source-maps-"));
  directories.push(directory);
  return directory;
}

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

function writePair(directory: string, name = "main.js") {
  const path = join(directory, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "console.log('synthetic output');\n");
  writeFileSync(`${path}.map`, sourceMap);
  return path;
}

function successfulUpload(expectedFiles?: () => string[]) {
  cli.mockImplementation(async (config, request) => {
    if (!("filePaths" in request))
      throw new Error("Expected explicit output paths.");
    expect(config.sourcemaps).toMatchObject({
      enabled: true,
      deleteAfterUpload: true,
      releaseName: "synthetic-desktop",
    });
    if (expectedFiles) {
      expect([...request.filePaths].sort()).toEqual(expectedFiles().sort());
    }
    for (const path of request.filePaths) {
      expect(javascript.test(path)).toBe(true);
      const map = JSON.parse(readFileSync(`${path}.map`, "utf8"));
      expect(map.version).toBe(3);
      expect(map.sources.length).toBeGreaterThan(0);
      expect(map.mappings.length).toBeGreaterThan(0);
    }
    for (const path of request.filePaths) {
      writeFileSync(path, `${readFileSync(path, "utf8")}\n${marker}\n`);
      unlinkSync(`${path}.map`);
    }
  });
}

function buildFixture(root: string, capture?: Plugin) {
  writeFileSync(
    join(root, "index.html"),
    '<!doctype html><script type="module" src="/main.ts"></script>',
  );
  writeFileSync(
    join(root, "main.ts"),
    `const worker = new Worker(new URL("./audience.worker.ts", import.meta.url), { type: "module" });
worker.postMessage("ready");
import("./lazy-main").then(({ value }) => console.log(value));`,
  );
  writeFileSync(
    join(root, "lazy-main.ts"),
    'export const value = "synthetic main import";',
  );
  writeFileSync(
    join(root, "audience.worker.ts"),
    `self.onmessage = async () => {
  const { calculate } = await import("./worker-lazy");
  self.postMessage(calculate(7));
};`,
  );
  writeFileSync(
    join(root, "worker-lazy.ts"),
    "export function calculate(value: number) { return value * 2; }",
  );
  return build({
    root,
    configFile: false,
    envDir: false,
    publicDir: false,
    logLevel: "silent",
    plugins: [posthogSourceMaps(options), ...(capture ? [capture] : [])],
    worker: { format: "es" },
    build: { outDir: "dist", emptyOutDir: true, minify: false },
  });
}

async function writeBundle(directory: string, bundle: Record<string, object>) {
  const hook = posthogSourceMaps(options).writeBundle;
  expect(hook).toMatchObject({ order: "post", sequential: true });
  if (!hook) throw new Error("Expected a writeBundle hook.");
  const handler = typeof hook === "function" ? hook : hook.handler;
  await Reflect.apply(handler, {}, [{ dir: directory }, bundle]);
}

describe("PostHog source maps for Vite worker assets", () => {
  it("requires an explicit CLI path for enabled uploads", () => {
    expect(() =>
      posthogSourceMaps({ ...options, cliBinaryPath: undefined }),
    ).toThrow("POSTHOG_CLI_BINARY_PATH");
    expect(cli).not.toHaveBeenCalled();
  });

  it("does not require or invoke the CLI when source-map uploads are disabled", async () => {
    const plugin = posthogSourceMaps({
      ...options,
      cliBinaryPath: undefined,
      sourcemaps: { enabled: false },
    });
    const hook = plugin.writeBundle;
    if (hook) {
      const handler = typeof hook === "function" ? hook : hook.handler;
      await Reflect.apply(handler, {}, [{ dir: temporary() }, {}]);
    }
    expect(cli).not.toHaveBeenCalled();
  });

  it("uploads main, worker and lazy outputs with maps, then preserves injected disk and bundle code", async () => {
    const root = temporary();
    const outDir = join(root, "dist");
    const captured: Record<string, string> = {};
    const capture: Plugin = {
      name: "capture-final-source-map-output",
      writeBundle: {
        order: "post",
        sequential: true,
        handler(_output, bundle) {
          for (const [name, entry] of Object.entries(bundle)) {
            if (!javascript.test(name)) continue;
            captured[name] =
              entry.type === "chunk"
                ? entry.code
                : typeof entry.source === "string"
                  ? entry.source
                  : Buffer.from(entry.source).toString("utf8");
          }
        },
      },
    };
    successfulUpload(() =>
      files(outDir).filter((path) => javascript.test(path)),
    );
    await buildFixture(root, capture);
    expect(cli).toHaveBeenCalledTimes(1);
    const outputs = files(outDir);
    expect(outputs.some((path) => path.endsWith(".map"))).toBe(false);
    for (const name of ["audience.worker", "worker-lazy", "lazy-main"]) {
      expect(
        outputs.some((path) => basename(path).startsWith(`${name}-`)),
      ).toBe(true);
    }
    const scripts = outputs.filter((path) => javascript.test(path));
    expect(Object.keys(captured)).toHaveLength(scripts.length);
    for (const path of scripts) {
      const code = readFileSync(path, "utf8");
      expect(code).toContain(marker);
      expect(code).not.toContain("sourceMappingURL=");
    }
    expect(Object.values(captured).every((code) => code.includes(marker))).toBe(
      true,
    );
  });

  it("rejects failed uploads without deleting generated maps", async () => {
    const root = temporary();
    cli.mockRejectedValue(new Error("Synthetic upload failure"));
    await expect(buildFixture(root)).rejects.toThrow(
      "Synthetic upload failure",
    );
    expect(cli).toHaveBeenCalledTimes(1);
    const scripts = files(join(root, "dist")).filter((path) =>
      javascript.test(path),
    );
    expect(scripts.length).toBeGreaterThanOrEqual(4);
    for (const path of scripts) {
      expect(existsSync(`${path}.map`)).toBe(true);
      expect(readFileSync(path, "utf8")).not.toContain(marker);
    }
  });

  it("includes JS, MJS and CJS assets as well as chunks and refreshes both source forms", async () => {
    const directory = temporary();
    const chunk = {
      type: "chunk",
      fileName: "main.js",
      code: "original chunk",
    };
    const asset = {
      type: "asset",
      fileName: "worker.mjs",
      source: "original asset",
    };
    const bytes = {
      type: "asset",
      fileName: "lazy.cjs",
      source: new Uint8Array([1]),
    };
    const paths = [chunk, asset, bytes].map((entry) =>
      writePair(directory, entry.fileName),
    );
    successfulUpload(() => paths);
    await writeBundle(directory, {
      "main.js": chunk,
      "worker.mjs": asset,
      "lazy.cjs": bytes,
    });
    expect(cli).toHaveBeenCalledTimes(1);
    expect(chunk.code).toContain(marker);
    expect(Buffer.from(asset.source).toString("utf8")).toContain(marker);
    expect(Buffer.from(bytes.source).toString("utf8")).toContain(marker);
  });

  it("rejects a successful CLI exit that did not inject a chunk identifier", async () => {
    const directory = temporary();
    const path = writePair(directory);
    cli.mockResolvedValue(undefined);
    await expect(
      writeBundle(directory, {
        "main.js": { type: "asset", fileName: "main.js", source: "original" },
      }),
    ).rejects.toThrow();
    expect(existsSync(`${path}.map`)).toBe(true);
  });

  it("rejects successful injection when the CLI leaves a source map on disk", async () => {
    const directory = temporary();
    const path = writePair(directory);
    cli.mockImplementation(async () => {
      writeFileSync(path, `${readFileSync(path, "utf8")}\n${marker}\n`);
    });
    await expect(
      writeBundle(directory, {
        "main.js": { type: "asset", fileName: "main.js", source: "original" },
      }),
    ).rejects.toThrow("inject and clean");
    expect(cli).toHaveBeenCalledTimes(1);
    expect(readFileSync(path, "utf8")).toContain(marker);
    expect(existsSync(`${path}.map`)).toBe(true);
  });

  it.each(["../outside.js", "nested/../../outside.js"])(
    "rejects an output path escaping the configured directory: %s",
    async (name) => {
      const root = temporary();
      const directory = join(root, "dist");
      mkdirSync(directory);
      const outside = writePair(root, "outside.js");
      const original = readFileSync(outside);
      await expect(
        writeBundle(directory, {
          [name]: { type: "asset", fileName: name, source: "original" },
        }),
      ).rejects.toThrow();
      expect(cli).not.toHaveBeenCalled();
      expect(readFileSync(outside)).toEqual(original);
    },
  );

  it("rejects output paths traversing a directory symlink or junction", async () => {
    const root = temporary();
    const directory = join(root, "dist");
    const outside = join(root, "outside");
    mkdirSync(directory);
    const target = writePair(outside);
    symlinkSync(
      outside,
      join(directory, "linked"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(
      writeBundle(directory, {
        "linked/main.js": {
          type: "asset",
          fileName: "linked/main.js",
          source: "original",
        },
      }),
    ).rejects.toThrow();
    expect(cli).not.toHaveBeenCalled();
    expect(readFileSync(target, "utf8")).toBe(
      "console.log('synthetic output');\n",
    );
  });

  it("rejects a build directory that is itself a symlink or junction", async () => {
    const root = temporary();
    const directory = join(root, "dist");
    const actual = join(root, "actual-output");
    const target = writePair(actual);
    symlinkSync(
      actual,
      directory,
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(
      writeBundle(directory, {
        "main.js": { type: "asset", fileName: "main.js", source: "original" },
      }),
    ).rejects.toThrow();
    expect(cli).not.toHaveBeenCalled();
    expect(readFileSync(target, "utf8")).toBe(
      "console.log('synthetic output');\n",
    );
  });

  it.each([
    ["invalid JSON", "not-json"],
    [
      "unsupported version",
      JSON.stringify({ version: 2, mappings: "AAAA", sources: ["input.ts"] }),
    ],
    [
      "empty mappings",
      JSON.stringify({ version: 3, mappings: "", sources: ["input.ts"] }),
    ],
    [
      "empty sources",
      JSON.stringify({ version: 3, mappings: "AAAA", sources: [] }),
    ],
  ])("rejects %s before invoking the CLI", async (_label, map) => {
    const directory = temporary();
    const path = writePair(directory);
    writeFileSync(`${path}.map`, map);
    await expect(
      writeBundle(directory, {
        "main.js": { type: "asset", fileName: "main.js", source: "original" },
      }),
    ).rejects.toThrow();
    expect(cli).not.toHaveBeenCalled();
    expect(readFileSync(`${path}.map`, "utf8")).toBe(map);
  });

  it("rejects a missing paired map before invoking the CLI", async () => {
    const directory = temporary();
    const path = writePair(directory);
    unlinkSync(`${path}.map`);
    await expect(
      writeBundle(directory, {
        "main.js": { type: "asset", fileName: "main.js", source: "original" },
      }),
    ).rejects.toThrow();
    expect(cli).not.toHaveBeenCalled();
  });

  it("rejects a script and map exceeding the combined 64 MiB limit", async () => {
    const directory = temporary();
    const path = writePair(directory);
    truncateSync(path, 64 * 1024 * 1024);
    await expect(
      writeBundle(directory, {
        "main.js": { type: "asset", fileName: "main.js", source: "original" },
      }),
    ).rejects.toThrow();
    expect(cli).not.toHaveBeenCalled();
  });

  it("rejects a bundle without JavaScript instead of silently reporting success", async () => {
    await expect(
      writeBundle(temporary(), {
        "style.css": { type: "asset", fileName: "style.css", source: "body{}" },
      }),
    ).rejects.toThrow("No JavaScript outputs");
    expect(cli).not.toHaveBeenCalled();
  });
});
