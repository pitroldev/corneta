import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  commandInvocation,
  loadEnvironmentFile,
  mergeEnvironment,
} from "./with-env.mjs";

describe("with-env: native dotenv semantics", () => {
  it("preserves inherited values, including empty strings, without mutating them", () => {
    const inherited = { EXISTING: "runner", PASSWORD: "" };
    const result = mergeEnvironment(
      "EXISTING=file\nPASSWORD=not-the-password\nNEW=value\n",
      inherited,
    );
    expect(result).toEqual({
      env: { EXISTING: "runner", PASSWORD: "", NEW: "value" },
      loaded: 1,
    });
    expect(inherited).toEqual({ EXISTING: "runner", PASSWORD: "" });
  });

  it("handles export, whitespace, quotes, hashes, equals and explicit empty values", () => {
    const { env } = mergeEnvironment(
      [
        "# comment",
        "export CLIENT = value # comment",
        'QUOTED=" spaces # = preserved "',
        "SINGLE='hash#preserved'",
        "EMPTY=",
        'EMPTY_QUOTES=""',
        "DUPLICATE=first",
        "DUPLICATE=last",
      ].join("\r\n"),
      {},
    );
    expect(env).toEqual({
      CLIENT: "value",
      QUOTED: " spaces # = preserved ",
      SINGLE: "hash#preserved",
      EMPTY: "",
      EMPTY_QUOTES: "",
      DUPLICATE: "last",
    });
  });

  it("accepts quoted multiline values but does not interpolate shell or variables", () => {
    const { env } = mergeEnvironment(
      'MULTILINE="line one\nline two"\nBASE=secret-fixture\nLITERAL=${BASE} $(echo no) `echo no`\n',
      {},
    );
    expect(env.MULTILINE).toBe("line one\nline two");
    expect(env.LITERAL).toBe("${BASE} $(echo no) `echo no`");
  });

  it("honors Windows case-insensitive inherited environment names", () => {
    expect(
      mergeEnvironment("PATH=file\npath=another", { Path: "runner" }, "win32"),
    ).toEqual({ env: { Path: "runner" }, loaded: 0 });
    expect(
      mergeEnvironment("PATH=file", { Path: "runner" }, "linux").env,
    ).toEqual({ Path: "runner", PATH: "file" });
  });

  it("does not interpret special object-property names as prototype mutations", () => {
    const { env } = mergeEnvironment(
      "__proto__=fixture\nconstructor=fixture",
      {},
    );
    expect(Object.getPrototypeOf(env)).toBe(Object.prototype);
    // Node's parser itself ignores __proto__; do not recreate special keys
    // with a second parser just to diverge from native dotenv semantics.
    expect(Object.hasOwn(env, "__proto__")).toBe(false);
    expect(env.constructor).toBe("fixture");
  });

  it("allows a missing file in CI but rejects other read errors without disclosing details", () => {
    const readError = (code) => () => {
      throw Object.assign(new Error("sensitive-value-and-private-path"), {
        code,
      });
    };
    expect(
      loadEnvironmentFile(
        "unused",
        { SAFE: "value" },
        { read: readError("ENOENT") },
      ),
    ).toEqual({ env: { SAFE: "value" }, loaded: 0, missing: true });
    for (const code of ["EACCES", "EIO", "EISDIR"]) {
      expect(() =>
        loadEnvironmentFile("unused", {}, { read: readError(code) }),
      ).toThrow("with-env: não foi possível ler o arquivo de configuração.");
      try {
        loadEnvironmentFile("unused", {}, { read: readError(code) });
      } catch (error) {
        expect(error.message).not.toContain("sensitive");
      }
    }
  });
});

describe("with-env: literal child invocation", () => {
  it.each(["win32", "linux"])(
    "resolves the Tauri JS entry without a shell on %s",
    (platform) => {
      const args = [
        "dev",
        "--config",
        "folder with spaces/config.json",
        "&",
        "%PATH%",
      ];
      expect(
        commandInvocation("tauri", args, {
          platform,
          node: "node-binary",
          resolveTauri: () => "node_modules/tauri entry.js",
        }),
      ).toEqual({
        command: "node-binary",
        args: ["node_modules/tauri entry.js", ...args],
        usesRust: true,
      });
    },
  );

  it("supports the known Windows Tauri shim without executing cmd.exe", () => {
    expect(
      commandInvocation("tauri.cmd", ["--version"], {
        platform: "win32",
        resolveTauri: () => "tauri.js",
      }).args,
    ).toEqual(["tauri.js", "--version"]);
    for (const command of ["other.cmd", "C:\\tools\\OTHER.BAT"]) {
      expect(() =>
        commandInvocation(command, [], { platform: "win32" }),
      ).toThrow("não são suportados");
    }
  });

  it("resolves the installed Tauri CLI to a real JS entry", () => {
    const invocation = commandInvocation("tauri", ["--version"]);
    expect(invocation.command).toBe(process.execPath);
    expect(invocation.args[0]).toMatch(/[\\/]tauri\.js$/);
  });

  it("reports a missing Tauri install without resolver paths or values", () => {
    expect(() =>
      commandInvocation("tauri", [], {
        resolveTauri: () => {
          throw new Error("private-path-or-value");
        },
      }),
    ).toThrow("with-env: CLI Tauri ausente; execute pnpm install.");
  });

  it("passes spaces, quotes and shell metacharacters literally to an actual child", () => {
    const values = [
      "with spaces",
      'a"quote',
      "& echo UNEXPECTED",
      "$(echo UNEXPECTED)",
      "%PATH%",
      "a|b",
      "a>b",
      "",
    ];
    const invocation = commandInvocation(process.execPath, [
      "-e",
      "process.stdout.write(JSON.stringify(process.argv.slice(1)))",
      "--",
      ...values,
    ]);
    const child = spawnSync(invocation.command, invocation.args, {
      encoding: "utf8",
      shell: false,
      timeout: 5000,
    });
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual(values);
  });

  it("marks only actual cargo command names as Rust and rejects NUL bytes", () => {
    expect(commandInvocation("cargo", ["test"]).usesRust).toBe(true);
    expect(commandInvocation("C:\\tools\\cargo.exe", ["test"]).usesRust).toBe(
      true,
    );
    expect(commandInvocation("not-cargo", []).usesRust).toBe(false);
    expect(() => commandInvocation("node", ["secret\0fixture"])).toThrow(
      "argumentos inválidos",
    );
  });
});
