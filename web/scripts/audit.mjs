// Auditoria da LP renderizada: contraste WCAG e classes utilitárias em conflito.
//
//   node scripts/audit.mjs [--path /rota]
//
// Existe porque os dois problemas que ela caça são invisíveis no código-fonte:
// contraste depende da cor EFETIVA depois da cascata, e conflito de utilitário
// depende de qual regra o Tailwind emitiu por último na folha — não da ordem em
// que as classes aparecem no className.

import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 7392;
const BASE = process.env.LP_URL ?? "http://localhost:7390";
const args = process.argv.slice(2);
const i = args.indexOf("--path");
const path = i >= 0 ? args[i + 1] : "/";

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--window-size=1280,900",
    "--hide-scrollbars",
    "--disable-gpu",
    "--no-first-run",
    "--user-data-dir=" + join(tmpdir(), "corneta-lp-audit"),
  ],
  { stdio: "ignore" },
);
process.on("exit", () => chrome.kill());

async function endpoint() {
  for (let n = 0; n < 60; n++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const page = (await r.json()).find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* subindo */
    }
    await sleep(250);
  }
  throw new Error("Chrome não abriu");
}

const ws = new WebSocket(await endpoint());
let seq = 0;
const pending = new Map();
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  const p = pending.get(m.id);
  if (p) {
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message));
    else p.resolve(m.result);
  }
};
const send = (method, params = {}) => {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
};

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: BASE + path });
await sleep(3500);

const AUDIT = `(() => {
  // --- contraste ---------------------------------------------------------
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4) };
  const lum = ([r,g,b]) => 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
  const parse = (s) => (s.match(/[\\d.]+/g) || []).map(Number);
  const ratio = (a,b) => { const [l1,l2]=[lum(a),lum(b)].sort((x,y)=>y-x); return (l1+0.05)/(l2+0.05) };

  // Fundo efetivo: sobe a árvore até achar cor opaca.
  function bgOf(el) {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c.length >= 3 && (c[3] === undefined || c[3] > 0.92)) return c.slice(0,3);
      n = n.parentElement;
    }
    return [16,11,7];
  }

  const bad = [];
  for (const el of document.querySelectorAll("body *")) {
    const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join("");
    if (!txt || txt.length < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity < 0.1) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const fg = parse(cs.color).slice(0,3);
    const px = parseFloat(cs.fontSize);
    const w = +cs.fontWeight || 400;
    const large = px >= 24 || (px >= 18.66 && w >= 700);
    const need = large ? 3 : 4.5;
    const got = ratio(fg, bgOf(el));
    if (got < need) bad.push({
      t: txt.slice(0,52), got: +got.toFixed(2), need,
      px: +px.toFixed(1), w,
      fg: cs.color, bg: "rgb(" + bgOf(el).join(",") + ")",
      sel: el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(/\\s+/).slice(0,2).join(".") : "")
    });
  }

  // --- botões de download: o compact esta vencendo? ----------------------
  const btns = [...document.querySelectorAll('a[data-placeholder-link]')].map(a => {
    const cs = getComputedStyle(a), r = a.getBoundingClientRect();
    return { texto: a.textContent.trim().slice(0,40), h: Math.round(r.height), w: Math.round(r.width),
             minH: cs.minHeight, padX: cs.paddingLeft, fonte: cs.fontSize, onde: a.closest("header") ? "NAVBAR" : a.closest("footer") ? "rodape" : "corpo" };
  });

  return { bad: bad.slice(0, 25), total: bad.length, btns };
})()`;

const { result } = await send("Runtime.evaluate", {
  expression: AUDIT,
  returnByValue: true,
});
const r = result.value;

console.log(`\n=== CONTRASTE: ${r.total} elementos abaixo do mínimo AA ===`);
for (const b of r.bad) {
  console.log(
    `  ${String(b.got).padStart(5)}:1 (precisa ${b.need})  ${String(b.px).padStart(5)}px/${b.w}  ${b.fg} sobre ${b.bg}`,
  );
  console.log(`         "${b.t}"  ${b.sel}`);
}

console.log(`\n=== BOTÕES DE DOWNLOAD ===`);
for (const b of r.btns) {
  console.log(
    `  ${b.onde.padEnd(7)} ${String(b.h).padStart(3)}x${String(b.w).padEnd(4)} min-height:${b.minH} padding-x:${b.padX} font:${b.fonte}  "${b.texto}"`,
  );
}

ws.close();
chrome.kill();
process.exit(0);
