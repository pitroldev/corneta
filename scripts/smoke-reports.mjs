// Real Chromium + built worker smoke test. Uses a disposable browser profile;
// never reads Corneta's desktop configuration, reports, recordings or accounts.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { preview } from "vite";

const browser =
  process.argv[2] ??
  process.env.CORNETA_CHROMIUM_PATH ??
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const locale = process.env.CORNETA_SMOKE_LOCALE || "pt-BR";
assert(["pt-BR", "en"].includes(locale), "Smoke locale must be pt-BR or en");
const labels =
  locale === "en"
    ? {
        consent: "Turn both off",
        reports: "Reports",
        story: "Open the stream story",
        download: "Download",
        noVideo: "This stream was not recorded",
      }
    : {
        consent: "Desligar as duas",
        reports: "Relatórios",
        story: "Abrir a história da live",
        download: "Baixar",
        noVideo: "Esta live não foi gravada",
      };
const output = process.env.CORNETA_SMOKE_OUTPUT_DIR
  ? path.resolve(process.env.CORNETA_SMOKE_OUTPUT_DIR)
  : await mkdtemp(path.join(tmpdir(), "corneta-smoke-result-"));
await mkdir(output, { recursive: true });
const screenshot = path.join(output, `report-${locale}.png`);
const reportFile = path.join(output, `result-${locale}.json`);
await access(browser);
const profile = await mkdtemp(path.join(tmpdir(), "corneta-browser-smoke-"));
const server = await preview({
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const address = server.httpServer.address();
const base = `http://127.0.0.1:${address.port}`;
const child = spawn(
  browser,
  [
    "--headless=new",
    "--no-first-run",
    "--disable-background-networking",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { windowsHide: true, stdio: "ignore" },
);
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
let socket;
let stage = "browser-start";
let captureScreenshot;
let browserVersion;
let pending;
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      port = Number(
        (
          await readFile(path.join(profile, "DevToolsActivePort"), "utf8")
        ).split("\n")[0],
      );
      break;
    } catch {
      await pause(100);
    }
  }
  assert(port, "Browser debugging endpoint did not start");
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(
    tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl,
  );
  await once(socket, "open");
  let serial = 0;
  pending = new Map();
  const errors = [];
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 20_000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown")
      errors.push(message.params.exceptionDetails.text);
    if (message.method === "Fetch.requestPaused") {
      const local = new URL(message.params.request.url).origin === base;
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
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const until = async (expression) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await pause(100);
    }
    throw new Error(`UI condition timed out: ${expression}`);
  };
  await call("Runtime.enable");
  await call("Page.enable");
  browserVersion = (await call("Browser.getVersion")).product;
  captureScreenshot = async () => {
    const capture = await call("Page.captureScreenshot", { format: "png" });
    await writeFile(screenshot, Buffer.from(capture.data, "base64"));
  };
  await call("Fetch.enable", {
    patterns: [{ urlPattern: "https://*" }, { urlPattern: "http://*" }],
  });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 600,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const legal = await readFile("src/lib/legal.ts", "utf8");
  const version = legal.match(/LEGAL_ACCEPT_VERSION = "([^"]+)"/)[1];
  await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `
    Object.defineProperty(navigator, "languages", { get: () => [${JSON.stringify(locale)}] });
    Object.defineProperty(navigator, "language", { get: () => ${JSON.stringify(locale)} });
    localStorage.setItem("corneta.welcomed", "1");
    localStorage.setItem("corneta.legal.accepted", JSON.stringify({ version: ${JSON.stringify(version)}, at: new Date().toISOString() }));
  `,
  });
  stage = "consent";
  await call("Page.navigate", { url: base });
  // Dismiss the notice through its real UI, in this disposable profile only.
  await until(
    `[...document.querySelectorAll('button')].some(button => button.textContent.trim() === ${JSON.stringify(labels.consent)})`,
  );
  await evaluate(
    `[...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(labels.consent)}).click()`,
  );
  await until(`!document.querySelector('[role="dialog"]')`);
  stage = "report-list";
  await until(
    `[...document.querySelectorAll('button')].some(button => button.textContent.includes(${JSON.stringify(labels.reports)}))`,
  );
  await evaluate(
    `[...document.querySelectorAll('button')].find(button => button.textContent.includes(${JSON.stringify(labels.reports)})).click()`,
  );
  await until(
    `[...document.querySelectorAll('button')].some(button => (button.getAttribute('aria-label') || button.textContent).includes(${JSON.stringify(labels.story)}))`,
  );
  const previousScroll = await evaluate(
    `(() => { const scroller = document.getElementById('screen-scroll'); scroller.scrollTop = scroller.scrollHeight; return scroller.scrollTop; })()`,
  );
  assert(
    previousScroll > 0,
    "The list must actually be scrolled before testing report navigation",
  );
  stage = "report-open-top";
  await evaluate(
    `[...document.querySelectorAll('button')].find(button => (button.getAttribute('aria-label') || button.textContent).includes(${JSON.stringify(labels.story)})).click()`,
  );
  await until(
    `[...document.querySelectorAll('button')].some(button => button.textContent.trim() === ${JSON.stringify(labels.download)})`,
  );
  await until(`document.getElementById('screen-scroll').scrollTop <= 1`);
  assert(
    await evaluate(
      `document.body.textContent.includes(${JSON.stringify(labels.noVideo)})`,
    ),
    "Synthetic no-video state must be visible",
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  stage = "download-keyboard-focus";
  await call("Page.bringToFront");
  await evaluate(
    `[...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(labels.download)}).focus()`,
  );
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    text: "\r",
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
  });
  await until(`!!document.querySelector('[role="dialog"]')`);
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await until(`!document.querySelector('[role="dialog"]')`);
  await until(
    `document.activeElement.textContent.trim() === ${JSON.stringify(labels.download)}`,
  );
  // Browser zoom/text scaling: avoid a horizontal document scrollbar or clipped
  // main story when a streamer uses larger fonts.
  await evaluate(`document.documentElement.style.fontSize = '20px'`);
  await evaluate(
    `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
  );
  assert(
    await evaluate(
      `document.getElementById('screen-scroll').scrollWidth <= document.getElementById('screen-scroll').clientWidth + 1`,
    ),
    "Large-font story must not overflow horizontally",
  );
  await evaluate(`document.documentElement.style.fontSize = ''`);
  await captureScreenshot();

  stage = "large-report-worker";
  const workerFile = (await readdir("dist/assets")).find((file) =>
    /^report\.worker-.*\.js$/.test(file),
  );
  assert(workerFile, "Built report worker is missing");
  const result = await evaluate(`(async () => {
    const worker = new Worker('/assets/${workerFile}', { type: 'module' });
    let serial = 0;
    const run = task => new Promise((resolve, reject) => {
      worker.onmessage = event => event.data.error ? reject(Error(event.data.error)) : resolve(event.data.result);
      worker.onerror = () => reject(Error('Worker failed'));
      worker.postMessage({ id: ++serial, task }, task.raw instanceof ArrayBuffer ? [task.raw] : []);
    });
    try {
      const raw = [{kind:'meta',id:'1786151052661',startedAt:1000,mode:'per-platform',platforms:[]}];
      for(let i=0;i<14400;i++) raw.push({kind:'sample',t:1000+i*2000,cpu:50+(i%30),targets:[]});
      raw.push({kind:'end',endedAt:28801000});
      const bytes = new TextEncoder().encode(raw.map(line=>JSON.stringify(line)).join('\\n')).buffer;
      const start = performance.now();
      const detail = await run({kind:'analyze',raw:bytes,locale:'pt-BR'});
      const analysisMs = performance.now()-start;
      const chat = Array.from({length:10000},(_,i)=>JSON.stringify({t:i,m:'message '+i,i:String(i),p:'twitch'}));
      chat.push(JSON.stringify({t:20000,del:'5000'}));
      const page = await run({kind:'chat',raw:chat.join('\\n'),epoch:5100});
      const latePage = await run({kind:'chat',raw:chat.join('\\n'),epoch:9000});
      const exported = await run({kind:'export',data:detail.data,analysis:detail.analysis,format:'json',anonymous:true,locale:'pt-BR'});
      return {samples:detail.data.samples.length,detached:bytes.byteLength===0,pageSize:page.messages.length,latePageSize:latePage.messages.length,seekChangedPage:latePage.messages.some(message=>message.i==='9000')&&!page.messages.some(message=>message.i==='9000'),total:page.total,deleted:page.messages.find(message=>message.i==='5000').deleted,exportBytes:exported.content.length,analysisMs};
    } finally { worker.terminate(); }
  })()`);
  assert.equal(result.samples, 14400);
  assert.equal(result.detached, true);
  assert.equal(result.total, 10000);
  assert.equal(result.deleted, true);
  assert(result.pageSize <= 700);
  assert(result.latePageSize <= 700);
  assert(result.seekChangedPage);
  assert(result.exportBytes > 0);
  assert.deepEqual(errors, []);
  const summary = {
    outcome: "passed",
    locale,
    browserVersion,
    ...result,
    reportOpenedAtTop: true,
    noVideo: true,
    keyboardFocusRestored: true,
    largeTextNoOverflow: true,
  };
  await writeFile(reportFile, JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify({ ...summary, screenshot }, null, 2));
} catch (error) {
  await captureScreenshot?.().catch(() => {});
  // Only constants/counters and the synthetic fixture screenshot are uploadable.
  // Never include exception messages, console text, requests, tokens or profiles.
  await writeFile(
    reportFile,
    JSON.stringify(
      { outcome: "failed", locale, stage, browserVersion },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  for (const request of pending?.values() || []) clearTimeout(request.timer);
  socket?.close();
  child.kill();
  await new Promise((resolve) => server.httpServer.close(resolve));
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}
