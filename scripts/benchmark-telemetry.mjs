import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { cpus, release, tmpdir, totalmem } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { contributorEnvironment } from "./contributor.mjs";
import {
  assertBenchmarkCheckout,
  assertTelemetrySample,
  percentile,
  telemetryScenarios,
  telemetrySourceIdentity,
} from "./benchmark-telemetry-core.mjs";

const root = resolve(import.meta.dirname, "..");
const browser = resolve(
  process.argv[2] ??
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
);
const iterations = Number(process.argv[3] ?? 3);
assert(
  process.argv.length <= 4 &&
    Number.isSafeInteger(iterations) &&
    iterations >= 1 &&
    iterations <= 10,
  "Usage: pnpm benchmark:telemetry [Chromium executable] [iterations: 1-10]",
);
assertBenchmarkCheckout(root);

if (process.env.CORNETA_TELEMETRY_BENCHMARK_CHILD !== "1") {
  const child = spawn(
    process.execPath,
    [import.meta.filename, browser, String(iterations)],
    {
      cwd: root,
      env: {
        ...contributorEnvironment(process.env, root),
        CORNETA_TELEMETRY_BENCHMARK_CHILD: "1",
      },
      stdio: "inherit",
      windowsHide: true,
      shell: false,
    },
  );
  child.once("error", () => {
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
} else {
  await main();
}

async function connect(port, base, counters) {
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
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
        reject(new Error(`CDP timeout: ${method}`));
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
        request.reject(new Error("Browser protocol request failed."));
      else request.resolve(message.result);
    }
    if (message.method === "Fetch.requestPaused") {
      const local = new URL(message.params.request.url).origin === base;
      if (!local) counters.blockedExternalRequests++;
      void call(local ? "Fetch.continueRequest" : "Fetch.failRequest", {
        requestId: message.params.requestId,
        ...(local ? {} : { errorReason: "BlockedByClient" }),
      }).catch(() => {});
    }
  });
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    assert(!result.exceptionDetails, "Benchmark browser evaluation failed.");
    return result.result.value;
  };
  return {
    call,
    evaluate,
    close() {
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error("Benchmark browser closed."));
      }
      pending.clear();
      socket.close();
    },
  };
}

async function main() {
  const environment = contributorEnvironment(process.env, root);
  for (const key of Object.keys(process.env))
    if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
  await access(browser);
  const source = telemetrySourceIdentity(root);
  const packageJson = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );
  const sdkPackage = JSON.parse(
    await readFile(join(root, "node_modules/posthog-js/package.json"), "utf8"),
  );
  const temporaryParent = await realpath(tmpdir());
  const temporary = await mkdtemp(
    join(temporaryParent, "corneta-telemetry-benchmark-"),
  );
  const output = join(temporary, "dist");
  const profile = join(temporary, "profile");
  let server;
  let child;
  let cdp;
  let stage = "build";
  const counters = {
    collectorRequests: 0,
    collectorBytes: 0,
    blockedExternalRequests: 0,
    offline: false,
  };
  try {
    const { build, preview } = await import("vite");
    await build({
      root,
      configFile: false,
      envDir: false,
      publicDir: false,
      logLevel: "error",
      define: { __APP_VERSION__: JSON.stringify(packageJson.version) },
      build: {
        outDir: output,
        emptyOutDir: true,
        sourcemap: false,
        target: "es2022",
        rolldownOptions: {
          input: join(root, "scripts/benchmark-telemetry.html"),
        },
      },
    });
    server = await preview({
      root,
      configFile: false,
      envDir: false,
      publicDir: false,
      logLevel: "error",
      build: { outDir: output },
      preview: { host: "127.0.0.1", port: 0, open: false },
      plugins: [
        {
          name: "loopback-telemetry-sink",
          configurePreviewServer(instance) {
            instance.middlewares.use((request, response, next) => {
              if (request.method !== "POST") return next();
              counters.collectorRequests++;
              request.on("data", (chunk) => {
                counters.collectorBytes += chunk.length;
              });
              request.on("end", () => {
                response.writeHead(counters.offline ? 503 : 200, {
                  "Content-Type": "application/json",
                  "Cache-Control": "no-store",
                });
                response.end(
                  counters.offline ? '{"status":0}' : '{"status":1}',
                );
              });
            });
          },
        },
      ],
    });
    const address = server.httpServer.address();
    const base = `http://127.0.0.1:${address.port}`;
    await mkdir(profile);
    stage = "browser-start";
    child = spawn(
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
        env: contributorEnvironment(process.env, root),
        windowsHide: true,
        stdio: "ignore",
        shell: false,
      },
    );
    let browserFailed = false;
    child.once("error", () => {
      browserFailed = true;
    });
    let port;
    for (let attempt = 0; attempt < 100; attempt++) {
      assert(!browserFailed, "Could not start benchmark browser.");
      try {
        port = Number(
          (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(
            "\n",
          )[0],
        );
        break;
      } catch {
        await pause(100);
      }
    }
    assert(port, "Benchmark browser debugging endpoint did not start.");
    cdp = await connect(port, base, counters);
    await cdp.call("Runtime.enable");
    await cdp.call("Page.enable");
    await cdp.call("Network.enable");
    await cdp.call("Network.setCacheDisabled", { cacheDisabled: true });
    // Real webviews are not WebDriver sessions; keep SDK bot filtering enabled while exercising captures locally.
    await cdp.call("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        Object.defineProperty(navigator, "webdriver", { get: () => false });
        const ordinaryAgent = navigator.userAgent.replaceAll("HeadlessChrome", "Chrome");
        Object.defineProperty(navigator, "userAgent", { get: () => ordinaryAgent });
        Object.defineProperty(navigator, "userAgentData", { get: () => undefined });
        Object.defineProperty(navigator, "doNotTrack", { get: () => "0" });
      `,
    });
    await cdp.call("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    const browserVersion = (await cdp.call("Browser.getVersion")).product;
    const samples = [];
    for (let iteration = 0; iteration < iterations; iteration++) {
      for (const scenario of telemetryScenarios) {
        for (const enabled of iteration % 2 ? [true, false] : [false, true]) {
          stage = `${scenario}/${enabled ? "enabled" : "disabled"}/${iteration + 1}`;
          console.log(`Telemetry benchmark: ${stage}`);
          await cdp.evaluate("delete globalThis.telemetryBenchmark");
          await cdp.call("Page.navigate", {
            url: `${base}/scripts/benchmark-telemetry.html`,
          });
          let ready = false;
          for (let attempt = 0; attempt < 100; attempt++) {
            if (await cdp.evaluate("Boolean(globalThis.telemetryBenchmark)")) {
              ready = true;
              break;
            }
            await pause(50);
          }
          assert(ready, "Benchmark harness did not load.");
          await cdp.call("Page.bringToFront");
          Object.assign(counters, {
            collectorRequests: 0,
            collectorBytes: 0,
            offline: scenario === "offline",
          });
          await cdp.call("HeapProfiler.collectGarbage");
          const before = await cdp.call("Runtime.getHeapUsage");
          await cdp.evaluate(
            `globalThis.telemetryBenchmark.prepare(${enabled}, ${JSON.stringify(scenario)})`,
          );
          const result = await cdp.evaluate(
            `globalThis.telemetryBenchmark.run(${JSON.stringify(scenario)})`,
          );
          const retainedBeforeGc = await cdp.call("Runtime.getHeapUsage");
          await cdp.call("HeapProfiler.collectGarbage");
          const after = await cdp.call("Runtime.getHeapUsage");
          const sample = {
            iteration: iteration + 1,
            scenario,
            enabled,
            ...result,
            collectorRequests: counters.collectorRequests,
            collectorBytes: counters.collectorBytes,
            blockedExternalRequests: counters.blockedExternalRequests,
            heap: {
              beforeBytes: before.usedSize,
              beforeGcBytes: retainedBeforeGc.usedSize,
              afterGcBytes: after.usedSize,
              retainedDeltaBytes: after.usedSize - before.usedSize,
            },
            timerDelayMs: {
              p50: percentile(result.timerDelays, 0.5),
              p95: percentile(result.timerDelays, 0.95),
              max: Math.max(0, ...result.timerDelays),
            },
            frameIntervalMs: {
              p50: percentile(result.frameIntervals, 0.5),
              p95: percentile(result.frameIntervals, 0.95),
              max: Math.max(0, ...result.frameIntervals),
            },
            longTasks: {
              count: result.longTasks.length,
              totalMs: result.longTasks.reduce(
                (total, value) => total + value,
                0,
              ),
            },
          };
          delete sample.timerDelays;
          delete sample.frameIntervals;
          assertTelemetrySample(sample, enabled);
          samples.push(sample);
        }
      }
    }
    assert.equal(
      telemetrySourceIdentity(root).sourceTreeSha256,
      source.sourceTreeSha256,
      "Measured sources changed during the benchmark.",
    );
    const report = {
      schemaVersion: 1,
      measuredAt: new Date().toISOString(),
      scenarioVersion: 1,
      source,
      runtime: {
        browser: browserVersion,
        node: process.versions.node,
        sdk: sdkPackage.version,
        appVersion: packageJson.version,
        platform: process.platform,
        arch: process.arch,
        osRelease: release(),
        cpuModel: cpus()[0]?.model,
        logicalCpus: cpus().length,
        memoryGiB: Math.round(totalmem() / 2 ** 30),
        syntheticBrowserSignals:
          "webdriver=false, HeadlessChrome marker removed, userAgentData absent, DNT=0; SDK configuration unchanged except loopback destination",
      },
      iterations,
      samples,
      scope:
        "Synthetic browser telemetry facade and real PostHog SDK; loopback collector only. Cold document/module loads with browser disk cache disabled, not OS-cold starts. Heap is V8 JS heap after forced GC, not native RSS/GPU or proof of leak freedom. Offline means local HTTP 503 during the stated sample; single-attempt delivery must retain no SDK retries. In-flight requests cannot be recalled. Capture timing excludes synthetic input construction and diagnostic sampling; responsiveness includes the entire workload. No full app/React startup, IPC, stream, production event or account is exercised.",
    };
    const destination = join(root, ".artifacts/performance");
    await mkdir(destination, { recursive: true });
    await writeFile(
      join(destination, "telemetry.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(
      `Telemetry benchmark passed: ${samples.length} samples; .artifacts/performance/telemetry.json`,
    );
  } catch {
    console.error(
      `Telemetry benchmark failed at ${stage}; no result was approved.`,
    );
    process.exitCode = 1;
  } finally {
    await cdp?.call("Browser.close").catch(() => {});
    cdp?.close();
    if (child && child.exitCode === null) {
      child.kill();
      await once(child, "exit", { signal: AbortSignal.timeout(5000) }).catch(
        () => {},
      );
    }
    if (server)
      await new Promise((complete) => server.httpServer.close(complete));
    assert(
      dirname(temporary) === temporaryParent &&
        basename(temporary).startsWith("corneta-telemetry-benchmark-") &&
        (await realpath(temporary)) === temporary,
      "Refusing cleanup outside the benchmark temporary directory.",
    );
    await rm(temporary, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  }
}
