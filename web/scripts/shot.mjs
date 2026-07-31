// Screenshot da LP por CDP, sem Playwright.
//
// Existe porque a LP não tem teste visual: qualquer refactor grande (CSS →
// utilitário, CSS-only → framer-motion) precisa de um antes/depois pra provar
// que o desenho não andou. Rode com o `pnpm --dir web dev` de pé.
//
//   node scripts/shot.mjs <rótulo> [--sel .algum-seletor] [--w 1280]
//
// DUAS ARMADILHAS que já custaram tempo aqui, e por isso o caminho é CDP:
//  • `chrome --screenshot` captura o PRIMEIRO paint — pega a página sem fonte,
//    sem imagem e no meio da animação de entrada;
//  • `--virtual-time-budget` PENDURA pra sempre numa página com animação
//    infinita (o ticker da LP é `marquee`, que nunca termina).
// Com CDP dá pra navegar, esperar o load de verdade, congelar as animações e
// só então capturar.

import { writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 7391;
const BASE = process.env.LP_URL ?? "http://localhost:7390";
const OUT = new URL("../.shots/", import.meta.url).pathname.replace(/^\//, "");

const args = process.argv.slice(2);
const label = args[0] ?? "shot";
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const selector = flag("sel", null);
const width = Number(flag("w", 1280));
const path = flag("path", "/");
// Amplia a captura sem mexer no layout: útil pra julgar alinhamento óptico de
// peça pequena, onde um PNG 1:1 de 62px não deixa ver nada.
const scale = Number(flag("scale", 1));

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--window-size=${width},900`,
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--disable-gpu",
    "--no-first-run",
    // Fora de .shots de propósito: o perfil traz extensões empacotadas do
    // Chrome, e o eslint do projeto ia lintar JS minificado de terceiro.
    "--user-data-dir=" + join(tmpdir(), "corneta-lp-shot"),
  ],
  { stdio: "ignore" },
);

const cleanup = () => chrome.kill();
process.on("exit", cleanup);

// O endpoint do CDP só sobe depois que o Chrome abre a porta.
//
// Tem que ser o alvo da ABA (`/json/list`, type "page"), não o do browser que o
// `/json/version` devolve: o endpoint do browser não expõe o domínio `Page` e a
// primeira chamada morre com "'Page.enable' wasn't found".
async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const page = (await r.json()).find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* ainda subindo */
    }
    await sleep(250);
  }
  throw new Error("Chrome não abriu uma aba depurável");
}

// WebSocket nativo do Node 22 — sem dependência.
function connect(url) {
  const ws = new WebSocket(url);
  let seq = 0;
  const pending = new Map();
  const ready = new Promise((res) => (ws.onopen = res));
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    const p = pending.get(msg.id);
    if (p) {
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  };
  return {
    ready,
    send(method, params = {}) {
      const id = ++seq;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) =>
        pending.set(id, { resolve, reject }),
      );
    },
    close: () => ws.close(),
  };
}

const cdp = connect(await endpoint());
await cdp.ready;

await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Page.navigate", { url: BASE + path });

// Espera o load real e dá um respiro pra fonte e para a animação de entrada.
await new Promise((res) => {
  const t = setTimeout(res, 15000);
  const iv = setInterval(async () => {
    const { result } = await cdp.send("Runtime.evaluate", {
      expression: "document.readyState === 'complete' && document.fonts.status",
      returnByValue: true,
    });
    if (result.value === "loaded") {
      clearInterval(iv);
      clearTimeout(t);
      res();
    }
  }, 200);
});
await sleep(900);

// Congela tudo que se move: sem isso duas capturas do mesmo estado diferem
// (o ticker anda) e a comparação vira ruído.
await cdp.send("Runtime.evaluate", {
  expression: `
    const s = document.createElement('style');
    s.textContent = '*,*::before,*::after{animation-play-state:paused !important;transition:none !important}';
    document.head.appendChild(s);
  `,
});

if (scale !== 1) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 900,
    deviceScaleFactor: scale,
    mobile: false,
  });
  await sleep(300);
}

let clip;
if (selector) {
  const { result } = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height, scale: 1 };
    })()`,
    returnByValue: true,
  });
  if (!result.value) throw new Error(`seletor não encontrado: ${selector}`);
  clip = result.value;
}

const { data } = await cdp.send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: true,
  ...(clip ? { clip } : {}),
});

mkdirSync(OUT, { recursive: true });
const file = `${OUT}${label}.png`;
writeFileSync(file, Buffer.from(data, "base64"));
console.log(file);

cdp.close();
chrome.kill();
process.exit(0);
