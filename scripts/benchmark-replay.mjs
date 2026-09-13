import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { cpus, release, tmpdir, totalmem } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as pause } from "node:timers/promises";
import { contributorEnvironment } from "./contributor.mjs";

const root = resolve(import.meta.dirname, "..");
const browser = resolve(
  process.argv[2] ??
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
);
assert(
  process.argv.length <= 3,
  "Usage: pnpm benchmark:replay [Chromium executable]",
);
for (const folder of [root, join(root, "web"), join(root, "src-tauri")]) {
  assert.equal(
    await realpath(folder),
    folder,
    "Replay benchmark checkout must not use filesystem links",
  );
  assert(
    !(await readdir(folder)).some(
      (name) => name.startsWith(".env") && name !== ".env.example",
    ),
    "Run the replay benchmark in a disposable checkout without real dotenv files",
  );
}
const environment = contributorEnvironment(process.env, root);
const measuredSource = await replaySourceIdentity();
const temporaryParent = await realpath(tmpdir());
const temporary = await mkdtemp(
  join(temporaryParent, "corneta-replay-benchmark-"),
);
let stage = "prepare";
let native;
let browserChild;
let pageServer;
let cdp;
try {
  assert.equal(
    process.platform,
    "win32",
    "The verified replay benchmark currently requires Windows",
  );
  await access(browser);
  const ffmpeg = join(root, ".artifacts/media-tools/ffmpeg.exe");
  const evidence = JSON.parse(
    (
      await readFile(
        join(root, "src-tauri/binaries/third-party/sidecars.json"),
        "utf8",
      )
    ).replace(/^\uFEFF/, ""),
  );
  const provenance = JSON.parse(
    await readFile(join(root, "compliance/ffmpeg-provenance.json"), "utf8"),
  );
  assert.equal(
    evidence.ffmpeg.verified,
    true,
    "Prepare verified media tools with scripts/fetch-binaries.ps1 -ToolDirectory .artifacts/media-tools",
  );
  assert.equal(
    evidence.ffmpeg.archiveSha256.toLowerCase(),
    provenance.ffmpegArchiveSha256.toLowerCase(),
    "Media fixture tools must match the pinned archive",
  );
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(ffmpeg)) digest.update(chunk);
  assert.equal(
    digest.digest("hex"),
    evidence.ffmpeg.binarySha256.toLowerCase(),
    "Media fixture tool checksum does not match verified sidecar evidence",
  );

  stage = "native-build";
  await run(
    "cargo",
    [
      "build",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--locked",
      "--example",
      "benchmark-replay",
    ],
    600_000,
  );
  const nativeExecutable = join(
    environment.CARGO_TARGET_DIR,
    "debug/examples/benchmark-replay.exe",
  );
  native = await startNative(nativeExecutable);
  const fixtures = [];
  stage = "synthetic-media";
  for (const layout of ["finalized", "fragmented"]) {
    const path = join(temporary, `${layout}.mp4`);
    await run(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=640x360:rate=30",
        "-t",
        "3",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-threads",
        "2",
        "-pix_fmt",
        "yuv420p",
        "-g",
        "30",
        "-movflags",
        layout === "finalized"
          ? "+faststart"
          : "+frag_keyframe+empty_moov+default_base_moof",
        "-y",
        path,
      ],
      30_000,
    );
    const { url } = await native.call({ op: "open", path });
    fixtures.push({ layout, url });
  }

  stage = "browser-start";
  pageServer = createServer((request, response) => {
    if (request.headers.host !== "127.0.0.1:1420") {
      response.writeHead(403).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/html",
      "Cache-Control": "no-store",
    });
    response.end(
      "<!doctype html><html lang=en><title>Replay benchmark</title><body><video muted playsinline preload=metadata></video></body></html>",
    );
  });
  pageServer.listen(1420, "127.0.0.1");
  await once(pageServer, "listening", { signal: AbortSignal.timeout(5_000) });
  const profile = join(temporary, "profile");
  browserChild = spawn(
    browser,
    [
      "--headless=new",
      "--no-first-run",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--no-pings",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    {
      cwd: root,
      env: environment,
      windowsHide: true,
      stdio: "ignore",
      shell: false,
    },
  );
  let browserFailed = false;
  browserChild.once("error", () => {
    browserFailed = true;
  });
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert(!browserFailed, "Could not start benchmark browser");
    try {
      port = Number(
        (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(
          "\n",
        )[0],
      );
      if (port) break;
    } catch {
      port = undefined;
    }
    await pause(100);
  }
  assert(port, "Benchmark browser debugging endpoint did not start");
  cdp = await connectBrowser(
    port,
    new Set([
      "http://127.0.0.1:1420",
      ...fixtures.map(({ url }) => new URL(url).origin),
    ]),
  );
  await cdp.call("Runtime.enable");
  await cdp.call("Page.enable");
  await cdp.call("Network.enable");
  await cdp.call("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.call("Fetch.enable", {
    patterns: [{ urlPattern: "http://*" }, { urlPattern: "https://*" }],
  });
  await cdp.call("Page.navigate", { url: "http://127.0.0.1:1420" });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await cdp.evaluate("Boolean(document.querySelector('video'))")) break;
    await pause(50);
  }
  const samples = [];
  for (const fixture of fixtures) {
    stage = `playback-${fixture.layout}`;
    const baseline = await native.call({ op: "stats", url: fixture.url });
    const playback =
      await cdp.evaluate(`new Promise((resolveSample, rejectSample) => {
      const video = document.querySelector('video');
      let metadataMs = null;
      const started = performance.now();
      const timer = setTimeout(() => rejectSample(new Error('First frame deadline exceeded')), 10000);
      video.addEventListener('error', () => { clearTimeout(timer); rejectSample(new Error('Synthetic replay failed')); }, { once: true });
      video.addEventListener('loadedmetadata', () => { metadataMs = performance.now() - started; }, { once: true });
      video.requestVideoFrameCallback(() => {
        clearTimeout(timer);
        const firstFrameMs = performance.now() - started;
        video.pause();
        resolveSample({ metadataMs, firstFrameMs, durationSeconds: video.duration, width: video.videoWidth, height: video.videoHeight });
      });
      video.src = ${JSON.stringify(fixture.url)};
      video.play().catch(() => { clearTimeout(timer); rejectSample(new Error('Synthetic replay playback was rejected')); });
    })`);
    assert(
      Number.isFinite(playback.metadataMs) &&
        Number.isFinite(playback.firstFrameMs),
      "Browser did not provide replay timing evidence",
    );
    const reads = await native.call({ op: "stats", url: fixture.url });
    assert(
      reads.bytesRead > 0 && reads.peakBufferedBytes <= 65_536,
      "Replay transport exceeded its per-request read buffer bound",
    );
    samples.push({
      layout: fixture.layout,
      ...playback,
      nativeProcessMemoryBeforeBytes: baseline.nativeProcessMemoryBytes,
      reads,
    });
    await cdp.evaluate(
      "document.querySelector('video').removeAttribute('src'); document.querySelector('video').load(); true",
    );
    await native.call({ op: "release", url: fixture.url });
  }
  const result = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    browser: (await cdp.call("Browser.getVersion")).product,
    source: measuredSource,
    hardware: {
      cpu: cpus()[0]?.model ?? "unknown",
      logicalProcessors: cpus().length,
      memoryBytes: totalmem(),
      os: `${process.platform} ${release()}`,
      node: process.version,
    },
    scenario:
      "Synthetic 3-second H.264 clips through the actual native replay server",
    limitations: [
      "This is not a long-recording or HDD benchmark",
      "Headless Chromium is not the complete Corneta WebView2 UI",
      "Read buffer counters exclude HTTP, OS, GPU and browser allocations",
      "The separate sparse 12 GiB Rust tests validate offsets and bounded transfer, not codec startup for 12 GiB of actual media",
    ],
    samples,
  };
  assert.deepEqual(
    await replaySourceIdentity(),
    measuredSource,
    "Replay sources changed during the benchmark; run again after edits finish",
  );
  const output = join(root, ".artifacts/performance/replay.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    "Replay benchmark passed; sanitized results: .artifacts/performance/replay.json",
  );
} catch {
  console.error(
    `Replay benchmark failed at ${stage}; no recording paths or capability URLs were logged.`,
  );
  process.exitCode = 1;
} finally {
  if (cdp) {
    await cdp.call("Browser.close").catch(() => {});
    cdp.close();
  }
  await stop(browserChild);
  if (native) await native.close();
  if (pageServer) {
    pageServer.closeAllConnections();
    await new Promise((done) => pageServer.close(done));
  }
  const canonical = await realpath(temporary);
  assert(
    dirname(canonical) === temporaryParent &&
      basename(canonical).startsWith("corneta-replay-benchmark-"),
    "Refusing to remove an unexpected benchmark directory",
  );
  await rm(canonical, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}

async function run(command, args, timeout) {
  const child = spawn(command, args, {
    cwd: root,
    env: environment,
    windowsHide: true,
    stdio: "ignore",
    shell: false,
  });
  try {
    const [code] = await once(child, "exit", {
      signal: AbortSignal.timeout(timeout),
    });
    assert.equal(code, 0, "Benchmark helper failed");
  } finally {
    await stop(child);
  }
}

async function replaySourceIdentity() {
  const files = [
    "scripts/benchmark-replay.mjs",
    "src-tauri/examples/benchmark-replay.rs",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
  ];
  for (const directory of ["src-tauri/src/replay_media"]) {
    for (const file of await readdir(join(root, directory))) {
      if (file.endsWith(".rs")) files.push(`${directory}/${file}`);
    }
  }
  const manifest = [];
  for (const file of files.sort()) {
    const contents = (await readFile(join(root, file), "utf8")).replace(
      /\r\n/g,
      "\n",
    );
    manifest.push([file, createHash("sha256").update(contents).digest("hex")]);
  }
  return {
    sourceTreeSha256: createHash("sha256")
      .update(JSON.stringify(manifest))
      .digest("hex"),
    fileCount: files.length,
    scope:
      "Native replay transport, benchmark helpers and Rust dependency manifests; working-tree content, LF-normalized",
  };
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await once(child, "exit", { signal: AbortSignal.timeout(5_000) }).catch(
    () => {},
  );
}

async function startNative(executable) {
  const child = spawn(executable, [], {
    cwd: root,
    env: environment,
    windowsHide: true,
    stdio: ["pipe", "pipe", "ignore"],
    shell: false,
  });
  await once(child, "spawn", { signal: AbortSignal.timeout(10_000) });
  const lines = createInterface({ input: child.stdout });
  let pending;
  const disconnected = () => {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.reject(new Error("Native replay helper disconnected"));
    pending = undefined;
  };
  child.stdin.on("error", disconnected);
  child.once("exit", disconnected);
  lines.on("line", (line) => {
    if (!pending) return;
    const request = pending;
    pending = undefined;
    clearTimeout(request.timer);
    try {
      const result = JSON.parse(line);
      assert(result.ok, "Native replay helper rejected a command");
      request.resolve(result.value);
    } catch {
      request.reject(new Error("Native replay helper response failed"));
    }
  });
  return {
    call(command) {
      assert(!pending, "Replay helper requests must be sequential");
      assert(
        child.exitCode === null && !child.stdin.destroyed,
        "Native replay helper is not running",
      );
      return new Promise((resolveCall, reject) => {
        const timer = setTimeout(() => {
          pending = undefined;
          reject(new Error("Native replay helper timed out"));
        }, 10_000);
        pending = { resolve: resolveCall, reject, timer };
        child.stdin.write(`${JSON.stringify(command)}\n`);
      });
    },
    async close() {
      if (pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Native replay helper closed"));
        pending = undefined;
      }
      if (!child.stdin.destroyed)
        child.stdin.end(`${JSON.stringify({ op: "close" })}\n`);
      lines.close();
      await stop(child);
    },
  };
}

async function connectBrowser(port, allowedOrigins) {
  const tabs = await (
    await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(5_000),
    })
  ).json();
  const socket = new WebSocket(
    tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl,
  );
  await once(socket, "open", { signal: AbortSignal.timeout(10_000) });
  let serial = 0;
  const pending = new Map();
  const call = (method, params = {}) =>
    new Promise((resolveCall, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Replay browser protocol request timed out"));
      }, 15_000);
      pending.set(id, { resolve: resolveCall, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error)
        request.reject(new Error("Replay browser protocol request failed"));
      else request.resolve(message.result);
    }
    if (message.method === "Fetch.requestPaused") {
      const local = allowedOrigins.has(
        new URL(message.params.request.url).origin,
      );
      void call(local ? "Fetch.continueRequest" : "Fetch.failRequest", {
        requestId: message.params.requestId,
        ...(local ? {} : { errorReason: "BlockedByClient" }),
      }).catch(() => {});
    }
  });
  return {
    call,
    async evaluate(expression) {
      const result = await call("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      assert(!result.exceptionDetails, "Replay browser evaluation failed");
      return result.result.value;
    },
    close() {
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error("Replay browser closed"));
      }
      pending.clear();
      socket.close();
    },
  };
}
