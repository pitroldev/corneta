import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { githubTransport, promoteRelease } from "./promote-release.mjs";
import { RELEASE_NOTICE_VERSION } from "./release-readiness.mjs";

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (
      dirname(resolve(directory)) !== resolve(tmpdir()) ||
      !basename(directory).startsWith("corneta-promote-test-")
    )
      throw new Error("Invalid test cleanup target.");
    rmSync(directory, { recursive: true, force: true });
  }
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha = "a".repeat(40);
const otherSha = "b".repeat(40);
const repository = "fixture/corneta";
const tag = "v0.8.1";
const base = `repos/${repository}`;
const url = (name) =>
  `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(name)}`;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "corneta-promote-test-"));
  directories.push(root);
  mkdirSync(join(root, "src-tauri"));
  mkdirSync(join(root, "assets"));
  for (const file of ["package.json", "src-tauri/tauri.conf.json"])
    writeFileSync(join(root, file), JSON.stringify({ version: "0.8.1" }));
  const files = {
    "Corneta_0.8.1_x64-setup.exe": "MZ synthetic installer; never executed",
    "Corneta_0.8.1_x64-setup.exe.sig": "synthetic-signature\n",
    "latest.json": JSON.stringify({
      version: "0.8.1",
      platforms: {
        "windows-x86_64": {
          signature: "synthetic-signature",
          url: url("Corneta_0.8.1_x64-setup.exe"),
        },
      },
    }),
    "corneta-third-party.zip":
      "PK synthetic compliance archive; never extracted",
  };
  files["SHA256SUMS.txt"] =
    Object.entries(files)
      .map(([name, bytes]) => `${sha256(bytes)}  ${name}`)
      .join("\n") + "\n";
  for (const [name, bytes] of Object.entries(files))
    writeFileSync(join(root, "assets", name), bytes);
  const expectedAssets = Object.entries(files).map(([name, bytes]) => ({
    name,
    size: Buffer.byteLength(bytes),
    sha256: sha256(bytes),
  }));
  const options = {
    root,
    repository,
    tag,
    sha,
    qualitySha: sha,
    telemetry: {
      disabled: false,
      buildSha: sha,
      tokenDigest: "c".repeat(64),
      noticeVersion: RELEASE_NOTICE_VERSION,
    },
    expectedAssets,
    installerPath: join(root, "assets/Corneta_0.8.1_x64-setup.exe"),
    signaturePath: join(root, "assets/Corneta_0.8.1_x64-setup.exe.sig"),
    manifestPath: join(root, "assets/latest.json"),
    checksumsPath: join(root, "assets/SHA256SUMS.txt"),
    compliancePath: join(root, "assets/corneta-third-party.zip"),
  };
  const release = {
    id: 41,
    tag_name: tag,
    draft: true,
    prerelease: false,
    target_commitish: "main",
    assets: expectedAssets.map((item, index) => ({
      id: index + 1,
      name: item.name,
      state: "uploaded",
      size: item.size,
      digest: `sha256:${item.sha256}`,
      browser_download_url: url(item.name),
    })),
  };
  const calls = [];
  const state = {
    release,
    environment: {
      name: "production-release",
      can_admins_bypass: false,
      protection_rules: [
        {
          type: "required_reviewers",
          reviewers: [{ type: "User", reviewer: { id: 17 } }],
        },
      ],
    },
    pages: [[release]],
    remoteSha: sha,
    annotated: false,
    reads: 0,
    refs: 0,
    beforeRead: undefined,
    beforeRef: undefined,
    patchResponse: undefined,
  };
  const api = async (request) => {
    calls.push(request);
    if (request.path === `${base}/environments/production-release`) {
      if (state.environment instanceof Error) throw state.environment;
      return state.environment;
    }
    if (request.path.startsWith(`${base}/releases?`)) {
      const page = Number(
        new URL(`https://api.github.com/${request.path}`).searchParams.get(
          "page",
        ),
      );
      return state.pages[page - 1] ?? [];
    }
    if (request.path === `${base}/git/ref/tags/${tag}`) {
      state.refs++;
      state.beforeRef?.(state.refs);
      return {
        ref: `refs/tags/${tag}`,
        object: {
          type: state.annotated ? "tag" : "commit",
          sha: state.remoteSha,
        },
      };
    }
    if (request.path === `${base}/git/tags/${state.remoteSha}`) {
      return { sha: state.remoteSha, object: { type: "commit", sha } };
    }
    if (request.path === `${base}/releases/41` && request.method === "GET") {
      state.reads++;
      state.beforeRead?.(state.reads);
      return state.release;
    }
    if (request.path === `${base}/releases/41` && request.method === "PATCH") {
      state.release = { ...state.release, draft: false };
      return state.patchResponse ?? state.release;
    }
    throw new Error("Unexpected simulated API request.");
  };
  const git = vi.fn(() => sha);
  const checkDeployment = vi.fn(async () => []);
  return {
    root,
    options,
    state,
    calls,
    api,
    git,
    checkDeployment,
    run: (overrides = {}) =>
      promoteRelease(
        { ...options, ...overrides },
        { api, git, checkDeployment },
      ),
    writes: () => calls.filter((request) => request.method === "PATCH"),
  };
}

function updateApprovedFile(test, path, text, { checksums = true } = {}) {
  writeFileSync(path, text);
  const name = basename(path);
  const approved = test.options.expectedAssets.find(
    (item) => item.name === name,
  );
  Object.assign(approved, {
    size: Buffer.byteLength(text),
    sha256: sha256(text),
  });
  if (checksums && name !== "SHA256SUMS.txt") {
    const content =
      test.options.expectedAssets
        .filter((item) => item.name !== "SHA256SUMS.txt")
        .map((item) => `${item.sha256}  ${item.name}`)
        .join("\n") + "\n";
    updateApprovedFile(test, test.options.checksumsPath, content, {
      checksums: false,
    });
  }
}

describe("release promotion", () => {
  it("rechecks deployment after final asset validation and immediately before publication", async () => {
    const test = fixture();
    test.checkDeployment.mockImplementation(async (config) => {
      expect(test.state.reads).toBe(2);
      expect(test.writes()).toEqual([]);
      expect(config).toEqual(test.options.telemetry);
      return [];
    });
    await test.run();
    expect(test.checkDeployment).toHaveBeenCalledTimes(1);
    expect(test.writes()).toHaveLength(1);
  });

  it.each([
    undefined,
    null,
    {},
    { disabled: "false" },
    { buildSha: otherSha },
    { tokenDigest: null },
    { tokenDigest: "c".repeat(63) },
    { noticeVersion: "2026-01-01" },
  ])(
    "requires the exact build-approved telemetry contract: %j",
    async (override) => {
      const test = fixture();
      const telemetry =
        override && Object.keys(override).length
          ? { ...test.options.telemetry, ...override }
          : override;
      await expect(test.run({ telemetry })).rejects.toThrow(
        /build-approved telemetry/,
      );
      expect(test.calls).toEqual([]);
      expect(test.checkDeployment).not.toHaveBeenCalled();
    },
  );

  it("keeps the disabled deployment contract but rejects an unexpected token digest", async () => {
    const test = fixture();
    const telemetry = {
      ...test.options.telemetry,
      disabled: true,
      tokenDigest: null,
    };
    expect((await test.run({ telemetry })).status).toBe("published");
    expect(test.checkDeployment).toHaveBeenCalledWith(telemetry);
    await expect(
      test.run({ telemetry: { ...telemetry, tokenDigest: "c".repeat(64) } }),
    ).rejects.toThrow(/build-approved telemetry/);
  });

  it.each([true, false])(
    "blocks a stale deployment even when draft is %s",
    async (draft) => {
      const test = fixture();
      test.state.release.draft = draft;
      test.checkDeployment.mockResolvedValue([
        "deployed site does not match the release SHA",
      ]);
      await expect(test.run()).rejects.toThrow(/no longer match/);
      expect(test.writes()).toEqual([]);
    },
  );

  it("fails closed when deployment verification fails or returns an invalid result", async () => {
    const test = fixture();
    test.checkDeployment.mockRejectedValueOnce(
      new Error("Synthetic transport failure"),
    );
    await expect(test.run()).rejects.toThrow();
    test.checkDeployment.mockResolvedValueOnce(undefined);
    await expect(test.run()).rejects.toThrow(/no longer match/);
    expect(test.writes()).toEqual([]);
  });

  it.each([
    "missing",
    "forbidden",
    "invalid",
    "wrong-name",
    "no-reviewers",
    "empty-reviewers",
    "invalid-reviewer",
    "admin-bypass",
  ])("blocks publication when environment protection is %s", async (kind) => {
    const test = fixture();
    if (kind === "missing" || kind === "forbidden")
      test.state.environment = new Error(
        `Simulated GitHub ${kind === "missing" ? 404 : 403}.`,
      );
    if (kind === "invalid") test.state.environment = null;
    if (kind === "wrong-name")
      test.state.environment.name = "another-environment";
    if (kind === "no-reviewers") test.state.environment.protection_rules = [];
    if (kind === "empty-reviewers")
      test.state.environment.protection_rules[0].reviewers = [];
    if (kind === "invalid-reviewer")
      test.state.environment.protection_rules[0].reviewers = [{}];
    if (kind === "admin-bypass")
      test.state.environment.can_admins_bypass = true;
    await expect(test.run()).rejects.toThrow();
    expect(test.writes()).toEqual([]);
    expect(test.calls).toEqual([
      { method: "GET", path: `${base}/environments/production-release` },
    ]);
  });

  it("requires environment protection even for an already published no-op", async () => {
    const test = fixture();
    test.state.release.draft = false;
    test.state.environment.protection_rules = [];
    await expect(test.run()).rejects.toThrow(/must require reviewers/);
    expect(test.writes()).toEqual([]);
  });

  it("publishes only after verifying approved bytes, the local identity, remote tag and final draft", async () => {
    const test = fixture();
    expect(await test.run()).toEqual({
      status: "published",
      tag,
      latest: true,
    });
    expect(test.git.mock.calls.map((call) => call[1])).toEqual([
      ["rev-parse", "--verify", "HEAD^{commit}"],
      ["rev-parse", "--verify", `refs/tags/${tag}^{commit}`],
    ]);
    expect(test.state.refs).toBe(2);
    expect(test.writes()).toEqual([
      {
        method: "PATCH",
        path: `${base}/releases/41`,
        body: { draft: false, make_latest: "true" },
      },
    ]);
    expect(
      test.calls.filter((request) => request.path.includes("git/ref/")),
    ).toHaveLength(2);
    expect(test.calls.at(-2)).toEqual({
      method: "GET",
      path: `${base}/releases/41`,
    });
  });

  it("resolves an annotated tag to the approved commit", async () => {
    const test = fixture();
    test.state.annotated = true;
    test.state.remoteSha = otherSha;
    expect((await test.run()).status).toBe("published");
    expect(
      test.calls.filter((request) => request.path.includes("git/tags/")),
    ).toHaveLength(2);
  });

  it("does not replace Latest when publishing an older stable version", async () => {
    const test = fixture();
    test.state.pages[0].push({
      id: 42,
      tag_name: "v0.9.0",
      draft: false,
      prerelease: false,
    });
    expect(await test.run()).toEqual({
      status: "published",
      tag,
      latest: false,
    });
    expect(test.writes()[0].body.make_latest).toBe("false");
  });

  it("ignores drafts and prereleases when determining the latest stable version", async () => {
    const test = fixture();
    test.state.pages[0].push(
      { id: 42, tag_name: "v1.0.0", draft: true, prerelease: false },
      { id: 43, tag_name: "v1.0.0-rc.1", draft: false, prerelease: true },
    );
    expect((await test.run()).latest).toBe(true);
  });

  it("reads subsequent pages before selecting Latest", async () => {
    const test = fixture();
    test.state.pages = [
      [
        test.state.release,
        ...Array.from({ length: 99 }, (_, index) => ({
          id: 100 + index,
          tag_name: `v0.7.${index}`,
          draft: false,
          prerelease: false,
        })),
      ],
      [{ id: 999, tag_name: "v0.10.0", draft: false, prerelease: false }],
    ];
    expect((await test.run()).latest).toBe(false);
    expect(test.calls.some((request) => request.path.endsWith("page=2"))).toBe(
      true,
    );
  });

  it("returns an idempotent no-op for an identical already published release", async () => {
    const test = fixture();
    test.state.release.draft = false;
    expect(await test.run()).toEqual({ status: "already-published", tag });
    expect(test.writes()).toEqual([]);
  });

  it("does not mutate an already published release with different bytes", async () => {
    const test = fixture();
    test.state.release.draft = false;
    test.state.release.assets[0].digest = `sha256:${"0".repeat(64)}`;
    await expect(test.run()).rejects.toThrow(/remote release asset/);
    expect(test.writes()).toEqual([]);
  });

  it.each(["quality", "local", "remote", "moved-remote", "tag", "version"])(
    "refuses a mismatched %s identity without publishing",
    async (kind) => {
      const test = fixture();
      const options = {};
      if (kind === "quality") options.qualitySha = otherSha;
      if (kind === "local") test.git.mockReturnValue(otherSha);
      if (kind === "remote") test.state.remoteSha = otherSha;
      if (kind === "moved-remote")
        test.state.beforeRef = (count) => {
          if (count === 2) test.state.remoteSha = otherSha;
        };
      if (kind === "tag") options.tag = "v0.8.2";
      if (kind === "version")
        writeFileSync(join(test.root, "package.json"), '{"version":"0.8.2"}');
      await expect(test.run(options)).rejects.toThrow();
      expect(test.writes()).toEqual([]);
    },
  );

  it.each([
    "extra",
    "missing",
    "duplicate",
    "pending",
    "size",
    "digest",
    "digest-missing",
    "url",
  ])("refuses %s remote assets before publishing", async (kind) => {
    const test = fixture();
    const assets = test.state.release.assets;
    if (kind === "extra")
      assets.push({ ...assets[0], id: 80, name: "debug.map" });
    if (kind === "missing") assets.pop();
    if (kind === "duplicate") assets[1] = { ...assets[0] };
    if (kind === "pending") assets[0].state = "new";
    if (kind === "size") assets[0].size++;
    if (kind === "digest") assets[0].digest = `sha256:${"0".repeat(64)}`;
    if (kind === "digest-missing") delete assets[0].digest;
    if (kind === "url")
      assets[0].browser_download_url = "https://example.invalid/installer.exe";
    await expect(test.run()).rejects.toThrow(/asset/);
    expect(test.writes()).toEqual([]);
  });

  it("rechecks draft assets immediately before publication", async () => {
    const test = fixture();
    test.state.beforeRead = (count) => {
      if (count === 2) test.state.release.assets[0].size++;
    };
    await expect(test.run()).rejects.toThrow(/remote release asset/);
    expect(test.writes()).toEqual([]);
  });

  it("does not publish again if another actor already published the verified draft", async () => {
    const test = fixture();
    test.state.beforeRead = (count) => {
      if (count === 2) test.state.release.draft = false;
    };
    expect((await test.run()).status).toBe("already-published");
    expect(test.writes()).toEqual([]);
  });

  it.each(["absent", "duplicate", "digest", "size"])(
    "requires a valid build-approved inventory: %s",
    async (kind) => {
      const test = fixture();
      if (kind === "absent") delete test.options.expectedAssets;
      if (kind === "duplicate")
        test.options.expectedAssets[1] = test.options.expectedAssets[0];
      if (kind === "digest")
        test.options.expectedAssets[0].sha256 = "0".repeat(64);
      if (kind === "size") test.options.expectedAssets[0].size++;
      await expect(test.run()).rejects.toThrow(/asset|inventory|file/);
      expect(test.calls).toEqual([]);
    },
  );

  it("rejects files changed after build approval", async () => {
    const test = fixture();
    writeFileSync(test.options.installerPath, "tampered artifact");
    await expect(test.run()).rejects.toThrow(/differs from the asset approved/);
    expect(test.calls).toEqual([]);
  });

  it.each(["version", "url", "platform", "signature"])(
    "checks the approved updater manifest's %s contract",
    async (kind) => {
      const test = fixture();
      const manifest = JSON.parse(
        readFileSync(test.options.manifestPath, "utf8"),
      );
      if (kind === "version") manifest.version = "0.8.2";
      if (kind === "url")
        manifest.platforms["windows-x86_64"].url =
          "https://example.invalid/installer.exe";
      if (kind === "platform")
        manifest.platforms["windows-aarch64"] =
          manifest.platforms["windows-x86_64"];
      if (kind === "signature")
        manifest.platforms["windows-x86_64"].signature = "wrong-signature";
      updateApprovedFile(
        test,
        test.options.manifestPath,
        JSON.stringify(manifest),
      );
      await expect(test.run()).rejects.toThrow(/updater manifest/);
      expect(test.calls).toEqual([]);
    },
  );

  it("rejects approved checksums that no longer describe the artifact set", async () => {
    const test = fixture();
    updateApprovedFile(
      test,
      test.options.checksumsPath,
      `${"0".repeat(64)}  unexpected.exe\n`,
      { checksums: false },
    );
    await expect(test.run()).rejects.toThrow(/SHA256SUMS/);
    expect(test.calls).toEqual([]);
  });

  it("checks every declared checksum rather than only the inventory length", async () => {
    const test = fixture();
    const content = readFileSync(test.options.checksumsPath, "utf8").replace(
      /^[a-f0-9]{64}/,
      "0".repeat(64),
    );
    updateApprovedFile(test, test.options.checksumsPath, content, {
      checksums: false,
    });
    await expect(test.run()).rejects.toThrow(/SHA256SUMS.txt does not match/);
    expect(test.calls).toEqual([]);
  });

  it("does not infer a draft identity from a missing release or repeated tag", async () => {
    const test = fixture();
    test.state.pages = [[]];
    await expect(test.run()).rejects.toThrow(/one existing release/);
    test.state.pages = [
      [test.state.release, { ...test.state.release, id: 42 }],
    ];
    await expect(test.run()).rejects.toThrow(/one existing release/);
    expect(test.writes()).toEqual([]);
  });

  it("bounds release pagination and fails closed when the listing cannot be completed", async () => {
    const test = fixture();
    test.state.pages = Array.from({ length: 20 }, (_, page) =>
      Array.from({ length: 100 }, (_, index) => ({
        id: 1000 + page * 100 + index,
        tag_name: `v0.7.${index}`,
        draft: true,
        prerelease: false,
      })),
    );
    await expect(test.run()).rejects.toThrow(
      /listing exceeds the verification limit/,
    );
    expect(
      test.calls.filter((request) =>
        request.path.startsWith(`${base}/releases?`),
      ),
    ).toHaveLength(20);
    expect(test.writes()).toEqual([]);
  });

  it("rejects an artifact outside the checkout before making API requests", async () => {
    const test = fixture();
    await expect(
      test.run({ installerPath: join(test.root, "..", "outside.exe") }),
    ).rejects.toThrow(/inside the checkout/);
    expect(test.calls).toEqual([]);
  });

  it("fails closed when the published response is incomplete without attempting rollback", async () => {
    const test = fixture();
    test.state.patchResponse = {
      ...test.state.release,
      draft: false,
      assets: [],
    };
    await expect(test.run()).rejects.toThrow(/five approved assets/);
    expect(test.writes()).toHaveLength(1);
    expect(
      test.calls.every(
        (request) => request.method === "GET" || request.method === "PATCH",
      ),
    ).toBe(true);
  });
});

describe("GitHub transport", () => {
  it("uses a fixed host and version, no shell, bounded output and JSON on stdin", async () => {
    const run = vi.fn(() => ({ status: 0, stdout: '{"draft":false}' }));
    const api = githubTransport({
      cwd: ".",
      env: { GH_TOKEN: "synthetic-token" },
      run,
    });
    const body = { draft: false, make_latest: "false" };
    expect(
      await api({ method: "PATCH", path: `${base}/releases/41`, body }),
    ).toEqual({ draft: false });
    const [command, args, options] = run.mock.calls[0];
    expect(command).toBe("gh");
    expect(args).toEqual([
      "api",
      "--hostname",
      "github.com",
      "--method",
      "PATCH",
      "-H",
      "Accept: application/vnd.github+json",
      "-H",
      "X-GitHub-Api-Version: 2026-03-10",
      `${base}/releases/41`,
      "--input",
      "-",
    ]);
    expect(options).toMatchObject({
      shell: false,
      windowsHide: true,
      input: JSON.stringify(body),
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    expect(args.join(" ")).not.toContain("synthetic-token");
  });

  it("does not reveal authentication material or raw error responses", async () => {
    const api = githubTransport({
      run: () => ({
        status: 1,
        stdout: "synthetic-sensitive-value",
        stderr: "synthetic-sensitive-value",
      }),
    });
    await expect(
      api({ method: "GET", path: `${base}/releases/41` }),
    ).rejects.toThrow(
      "GitHub release request failed; inspect the release before retrying.",
    );
  });

  it("rejects invalid API JSON and unsupported hosts before publication", async () => {
    const run = vi.fn(() => ({ status: 0, stdout: "invalid" }));
    const api = githubTransport({ run });
    await expect(
      api({ method: "GET", path: `${base}/releases/41` }),
    ).rejects.toThrow(/invalid release response/);
    await expect(
      api({ method: "GET", path: "https://example.invalid/releases/41" }),
    ).rejects.toThrow(/Invalid release API request/);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
