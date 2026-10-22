import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACCOUNT_PLATFORMS, CHAT_PLATFORMS } from "../src/platforms";
import { DESTINATIONS } from "../src/platforms/destinations";

const repo = fileURLToPath(new URL("..", import.meta.url));
const platformsDir = join(repo, "src/platforms");
const ids = DESTINATIONS.map((d) => d.id);

// Platform ids belong to their folders; everything else reads the registry or the catalog.
const ALLOWED: { file: string; text?: string; why: string }[] = [
  { file: "src/lib/api/demo.ts", why: "contributor demo seed data" },
  { file: "src/lib/i18n/", why: "translated copy" },
  {
    file: "src/lib/report.ts",
    text: 'o.p ?? "twitch"',
    why: "chat recordings from before multi-platform chat carry no platform",
  },
  {
    file: "src-tauri/src/commands.rs",
    text: 'platform: "twitch".into()',
    why: "sample alert for the overlay preview",
  },
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** Removes `#[cfg(test)]` items, whose fixtures may name any platform. */
function withoutRustTests(source: string): string {
  let out = source;
  for (
    let at = out.indexOf("#[cfg(test)]");
    at >= 0;
    at = out.indexOf("#[cfg(test)]", at)
  ) {
    const brace = out.indexOf("{", at);
    const semi = out.indexOf(";", at);
    let end: number;
    if (semi >= 0 && (brace < 0 || semi < brace)) end = semi + 1;
    else {
      let depth = 0;
      end = brace;
      for (; end < out.length; end++) {
        if (out[end] === "{") depth++;
        else if (out[end] === "}" && --depth === 0) break;
      }
      end++;
    }
    out = out.slice(0, at) + out.slice(end);
  }
  return out;
}

describe("platform boundaries", () => {
  it("loads each destination from src/platforms/<id>/destination.json", () => {
    const folders = readdirSync(platformsDir).filter((name) =>
      existsSync(join(platformsDir, name, "destination.json")),
    );
    expect([...ids].sort()).toEqual(folders.sort());
  });

  it("names platforms only inside src/platforms and src-tauri/src/platforms", () => {
    const names = [
      ...new Set([...ids, ...CHAT_PLATFORMS, ...ACCOUNT_PLATFORMS]),
    ];
    const literal = new RegExp(`["'\`](${names.join("|")})["'\`]`);
    const hits: string[] = [];
    for (const root of ["src", "src-tauri/src"]) {
      for (const path of files(join(repo, root))) {
        const file = relative(repo, path).replace(/\\/g, "/");
        if (!/\.(ts|tsx|rs)$/.test(file)) continue;
        if (/^(src|src-tauri\/src)\/platforms\//.test(file)) continue;
        if (/\.test\.tsx?$/.test(file) || file.endsWith("/tests.rs")) continue;
        let source = readFileSync(path, "utf8");
        if (file.endsWith(".rs")) source = withoutRustTests(source);
        source.split("\n").forEach((line, index) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line) || !literal.test(line)) return;
          const allowed = ALLOWED.some(
            (a) =>
              (file === a.file ||
                (a.file.endsWith("/") && file.startsWith(a.file))) &&
              (!a.text || line.includes(a.text)),
          );
          if (!allowed) hits.push(`${file}:${index + 1}: ${line.trim()}`);
        });
      }
    }
    expect(hits).toEqual([]);
  });
});
