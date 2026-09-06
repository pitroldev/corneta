// Real Chromium + built worker smoke test. Uses a disposable browser profile;
// never reads Corneta's desktop configuration, reports, recordings or accounts.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  access,
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
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
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
  const pending = new Map();
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
    if (message.method === "Fetch.requestPaused")
      void call("Fetch.failRequest", {
        requestId: message.params.requestId,
        errorReason: "BlockedByClient",
      });
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
  await call("Fetch.enable", { patterns: [{ urlPattern: "https://*" }] });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const legal = await readFile("src/lib/legal.ts", "utf8");
  const version = legal.match(/LEGAL_ACCEPT_VERSION = "([^"]+)"/)[1];
  await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `
    localStorage.setItem("corneta.welcomed", "1");
    localStorage.setItem("corneta.legal.accepted", JSON.stringify({ version: ${JSON.stringify(version)}, at: new Date().toISOString() }));
  `,
  });
  await call("Page.navigate", { url: base });
  // Dismiss the notice through its real UI, in this disposable profile only.
  await until(
    `[...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Desligar as duas')`,
  );
  await evaluate(
    `[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Desligar as duas').click()`,
  );
  await until(`!document.querySelector('[role="dialog"]')`);
  await until(
    `[...document.querySelectorAll('button')].some(button => button.textContent.includes('Relatórios'))`,
  );
  await evaluate(
    `[...document.querySelectorAll('button')].find(button => button.textContent.includes('Relatórios')).click()`,
  );
  await until(
    `!!document.querySelector('button[aria-label*="Abrir a história"]') || [...document.querySelectorAll('button')].some(button => button.textContent.includes('Abrir a história'))`,
  );
  await evaluate(
    `(document.querySelector('button[aria-label*="Abrir a história"]') || [...document.querySelectorAll('button')].find(button => button.textContent.includes('Abrir a história'))).click()`,
  );
  await until(
    `[...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Baixar')`,
  );
  await evaluate(
    `[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Baixar').click()`,
  );
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
  const screenshot = path.join(
    tmpdir(),
    `corneta-report-smoke-${Date.now()}.png`,
  );
  const capture = await call("Page.captureScreenshot", { format: "png" });
  await writeFile(screenshot, Buffer.from(capture.data, "base64"));

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
      const exported = await run({kind:'export',data:detail.data,analysis:detail.analysis,format:'json',anonymous:true,locale:'pt-BR'});
      return {samples:detail.data.samples.length,detached:bytes.byteLength===0,pageSize:page.messages.length,total:page.total,deleted:page.messages.find(message=>message.i==='5000').deleted,exportBytes:exported.content.length,analysisMs};
    } finally { worker.terminate(); }
  })()`);
  assert.equal(result.samples, 14400);
  assert.equal(result.detached, true);
  assert.equal(result.total, 10000);
  assert.equal(result.deleted, true);
  assert(result.pageSize <= 700);
  assert(result.exportBytes > 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ...result, screenshot }, null, 2));
} finally {
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
