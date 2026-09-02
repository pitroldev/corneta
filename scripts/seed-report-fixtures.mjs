import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const APP_ID = "br.com.pitroldev.corneta";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const root = process.env.APPDATA
  ? path.join(process.env.APPDATA, APP_ID)
  : path.join(os.homedir(), ".local", "share", APP_ID);
const sessionsDir = path.join(root, "sessions");
const manifestPath = path.join(root, ".report-fixtures.json");
const guidePath = path.join(root, "REPORT-FIXTURES.md");
const ffmpeg = path.resolve(
  "src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe",
);

const args = new Set(process.argv.slice(2));

function removeGenerated(manifest) {
  for (const file of manifest?.generatedFiles ?? []) {
    const resolved = path.resolve(file);
    if (
      resolved.startsWith(`${path.resolve(sessionsDir)}${path.sep}`) &&
      fs.existsSync(resolved)
    ) {
      fs.rmSync(resolved, { force: true });
    }
  }
}

function copyPreservingTimes(source, destination) {
  fs.copyFileSync(source, destination);
  const stat = fs.statSync(source);
  fs.utimesSync(destination, stat.atime, stat.mtime);
}

if (args.has("--clean") || args.has("--restore")) {
  if (!fs.existsSync(manifestPath)) {
    console.log("Nenhum pacote de relatórios fictícios registrado.");
    process.exit(0);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  removeGenerated(manifest);
  if (args.has("--restore") && fs.existsSync(manifest.backupDir)) {
    for (const entry of fs.readdirSync(manifest.backupDir, {
      withFileTypes: true,
    })) {
      const destination = path.join(sessionsDir, entry.name);
      if (entry.isFile() && !fs.existsSync(destination)) {
        copyPreservingTimes(
          path.join(manifest.backupDir, entry.name),
          destination,
        );
      }
    }
  }
  fs.rmSync(manifestPath, { force: true });
  fs.rmSync(guidePath, { force: true });
  console.log(
    args.has("--restore")
      ? `Fixtures removidos e arquivos ausentes restaurados de ${manifest.backupDir}`
      : `Fixtures removidos. O backup dos dados anteriores continua em ${manifest.backupDir}`,
  );
  process.exit(0);
}

fs.mkdirSync(sessionsDir, { recursive: true });
if (fs.existsSync(manifestPath)) {
  const previous = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  removeGenerated(previous);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(root, `sessions-backup-before-fixtures-${stamp}`);
fs.mkdirSync(backupDir, { recursive: true });
for (const entry of fs.readdirSync(sessionsDir, { withFileTypes: true })) {
  if (entry.isFile()) {
    copyPreservingTimes(
      path.join(sessionsDir, entry.name),
      path.join(backupDir, entry.name),
    );
  }
}

const platform = (platformId, name, bitrate) => ({
  id: `fixture_${platformId}`,
  name,
  platformId,
  bitrate,
});
const TWITCH = platform("twitch", "Twitch principal", 6_000);
const YOUTUBE = platform("youtube", "YouTube", 9_000);
const KICK = platform("kick", "Kick", 6_500);
const CUSTOM = platform("custom", "Servidor parceiro", 5_000);

const scenarios = [
  {
    slug: "gravacao-completa",
    title: "Gravação completa e sincronizada",
    ago: 2 * HOUR,
    durationMs: 30_000,
    stepMs: 2_000,
    mode: "hybrid",
    platforms: [TWITCH, YOUTUBE],
    video: "single",
    chatReplay: true,
    alerts: "basic",
    markers: [[0.48, "Clutch perfeito durante a gravação"]],
    note: "MP4 real, áudio, chat gravado, sync e finalização normal.",
  },
  {
    slug: "live-perfeita",
    title: "Live longa perfeita em três plataformas",
    ago: 1 * DAY,
    durationMs: 68 * 60_000,
    stepMs: 10_000,
    mode: "per-platform",
    platforms: [TWITCH, YOUTUBE, KICK],
    chatReplay: true,
    alerts: "all",
    markers: [
      [0.22, "Primeira vitória da noite"],
      [0.64, "Recorde de audiência simultânea"],
    ],
    note: "Sem incidentes; audiência, seguidores, chat e todos os alertas.",
  },
  {
    slug: "rede-instavel",
    title: "Upload saturado afetando todos os destinos",
    ago: 2 * DAY,
    durationMs: 42 * 60_000,
    stepMs: 10_000,
    mode: "per-platform",
    platforms: [TWITCH, YOUTUBE, KICK],
    incidents: [{ type: "network", from: 0.42, to: 0.49 }],
    alerts: "basic",
    markers: [[0.43, "Começou a chover — upload oscilando"]],
    note: "Bitrate baixo e reconexões simultâneas em todos os destinos.",
  },
  {
    slug: "falha-isolada-kick",
    title: "Falha isolada da Kick",
    ago: 3 * DAY,
    durationMs: 51 * 60_000,
    stepMs: 10_000,
    mode: "hybrid",
    platforms: [TWITCH, YOUTUBE, KICK],
    incidents: [{ type: "platform", target: 2, from: 0.31, to: 0.36 }],
    alerts: "basic",
    markers: [[0.33, "Kick fora; Twitch e YouTube normais"]],
    note: "Uma plataforma reconecta enquanto as demais seguem saudáveis.",
  },
  {
    slug: "sobrecarga-cpu-gpu",
    title: "Jogo ocupou a placa de vídeo",
    ago: 4 * DAY,
    durationMs: 35 * 60_000,
    stepMs: 10_000,
    mode: "per-platform",
    platforms: [TWITCH, YOUTUBE, KICK, CUSTOM],
    incidents: [{ type: "encoding", from: 0.55, to: 0.68 }],
    appName: "Cyberpunk 2077",
    appResource: "gpu",
    note: "O jogo passa de 95% da GPU um passo ANTES de o OBS pular quadros; a história do relatório sai como jogo → OBS → gargalo no PC.",
  },
  {
    slug: "navegador-cpu",
    title: "Navegador comeu o processador",
    ago: 16 * DAY,
    durationMs: 31 * 60_000,
    stepMs: 10_000,
    mode: "per-platform",
    platforms: [TWITCH, YOUTUBE],
    incidents: [{ type: "appcpu", from: 0.4, to: 0.5 }],
    appName: "Google Chrome",
    appResource: "cpu",
    markers: [[0.41, "Abriu o navegador com vinte abas"]],
    note: "Um aplicativo de fora segura ~80% do processador; o OBS deixa de codificar quadros; internet e plataformas seguem bem.",
  },
  {
    slug: "memoria-no-limite",
    title: "Memória no limite por causa do navegador",
    ago: 17 * DAY,
    durationMs: 27 * 60_000,
    stepMs: 10_000,
    mode: "hybrid",
    platforms: [TWITCH, YOUTUBE, KICK],
    incidents: [{ type: "appmem", from: 0.52, to: 0.6 }],
    appName: "Google Chrome",
    appResource: "memory",
    note: "Memória do PC acima de 92% com um aplicativo passando de 6 GB; o OBS pula quadros ao montar a cena.",
  },
  {
    slug: "obs-pesado",
    title: "O próprio OBS pesou na placa de vídeo",
    ago: 18 * DAY,
    durationMs: 29 * 60_000,
    stepMs: 10_000,
    mode: "passthrough",
    platforms: [TWITCH, YOUTUBE],
    incidents: [{ type: "obsheavy", from: 0.3, to: 0.4 }],
    markers: [[0.31, "Cena com três câmeras e filtros de fundo"]],
    note: "Sem aplicativo de fora: o OBS é quem chega a ~90% da placa. Deve aparecer como contexto, não como culpado.",
  },
  {
    slug: "render-obs",
    title: "Lag de renderização no OBS",
    ago: 5 * DAY,
    durationMs: 28 * 60_000,
    stepMs: 10_000,
    mode: "passthrough",
    platforms: [TWITCH, YOUTUBE],
    incidents: [{ type: "render", from: 0.24, to: 0.35 }],
    markers: [[0.25, "Cena pesada com navegador e câmera"]],
    note: "Render lento com CPU/GPU moderadas; exercita diagnóstico do OBS.",
  },
  {
    slug: "sinal-perdido",
    title: "Sinal do OBS perdido e recuperado",
    ago: 6 * DAY,
    durationMs: 33 * 60_000,
    stepMs: 10_000,
    mode: "hybrid",
    platforms: [TWITCH, YOUTUBE],
    incidents: [{ type: "signal", from: 0.46, to: 0.5 }],
    markers: [[0.47, "Cabo da placa de captura desconectado"]],
    note: "Estado signal-lost, zero bitrate e recuperação posterior.",
  },
  {
    slug: "viral-raid",
    title: "Raid viral e explosão do chat",
    ago: 7 * DAY,
    durationMs: 26 * 60_000,
    stepMs: 5_000,
    mode: "per-platform",
    platforms: [TWITCH, YOUTUBE, KICK],
    viral: true,
    chatReplay: true,
    alerts: "viral",
    markers: [[0.57, "Raid e pico de mensagens"]],
    note: "Pico abrupto de audiência, raid grande, subs, bits e chat intenso.",
  },
  {
    slug: "live-calma",
    title: "Live curta e silenciosa",
    ago: 8 * DAY,
    durationMs: 18 * 60_000,
    stepMs: 10_000,
    mode: "passthrough",
    platforms: [TWITCH],
    quiet: true,
    note: "Pouca audiência, zero alertas, quase nenhum chat e sem gravação.",
  },
  {
    slug: "gravacao-retomada",
    title: "Gravação morreu e retomou em dois segmentos",
    ago: 9 * DAY,
    durationMs: 30_000,
    stepMs: 2_000,
    mode: "hybrid",
    platforms: [TWITCH, YOUTUBE],
    video: "multi",
    chatReplay: true,
    incidents: [{ type: "network", from: 0.37, to: 0.5 }],
    markers: [[0.43, "FFmpeg retomado em novo segmento"]],
    note: "Dois MP4 reais, primeiro encerrado como died e segundo finalizado.",
  },
  {
    slug: "crash-recuperado",
    title: "Crash recuperado com vídeo truncado",
    ago: 10 * DAY,
    durationMs: 18_000,
    stepMs: 2_000,
    mode: "per-platform",
    platforms: [TWITCH, KICK],
    video: "truncated",
    incidents: [{ type: "error", target: 0, from: 0.72, to: 1 }],
    recovered: true,
    note: "MP4 real não finalizado, recEnd truncated e sessão fechada pelo boot.",
  },
  {
    slug: "relogio-e-sync",
    title: "Salto de relógio e ajuste manual do replay",
    ago: 11 * DAY,
    durationMs: 24 * 60_000,
    stepMs: 10_000,
    mode: "hybrid",
    platforms: [TWITCH, YOUTUBE],
    clockJump: { at: 0.44, delta: -125_000 },
    offsetMs: 1_850,
    markers: [[0.5, "Sincronia corrigida manualmente em +1,85 s"]],
    note: "ClockJump negativo e último offset append-only aplicado.",
  },
  {
    slug: "legado-v1",
    title: "Relatório antigo compatível",
    ago: 12 * DAY,
    durationMs: 22 * 60_000,
    stepMs: 15_000,
    mode: "per-platform",
    platforms: [TWITCH, YOUTUBE],
    legacy: true,
    alerts: "legacy",
    note: "Schema v1: sem OBS, chatBy, source nos alertas, followers ou replay.",
  },
  {
    slug: "video-ausente",
    title: "Metadado de gravação cujo arquivo sumiu",
    ago: 13 * DAY,
    durationMs: 12 * 60_000,
    stepMs: 10_000,
    mode: "hybrid",
    platforms: [TWITCH, YOUTUBE],
    video: "missing",
    markers: [[0.9, "Arquivo removido externamente"]],
    note: "Exercita player/estado de gravação ausente sem criar MP4.",
  },
  {
    slug: "brb-e-censura",
    title: "JÁ VOLTO e proteção de privacidade",
    ago: 14 * DAY,
    durationMs: 20 * 60_000,
    stepMs: 10_000,
    mode: "per-platform",
    platforms: [TWITCH, YOUTUBE, KICK],
    stateWindows: [
      { state: "brb", from: 0.28, to: 0.36 },
      { state: "censor", from: 0.66, to: 0.7 },
    ],
    markers: [
      [0.28, "JÁ VOLTO ativado"],
      [0.66, "Guardião ocultou dado sensível"],
    ],
    note: "Estados brb/censor sem falso positivo de queda de plataforma.",
  },
  {
    slug: "abortada-sem-dados",
    title: "Sessão abortada antes da primeira amostra",
    ago: 15 * DAY,
    durationMs: 4_000,
    stepMs: 0,
    mode: "per-platform",
    platforms: [TWITCH],
    note: "Somente meta, marcador e end; testa estado sem dados úteis.",
  },
];

function rngFor(seed) {
  let n = seed >>> 0;
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const round = (n, places = 0) => {
  const scale = 10 ** places;
  return Math.round(n * scale) / scale;
};
const within = (x, range) => x >= range.from && x <= range.to;
const line = (value) => JSON.stringify(value);

function alertRows(s, startedAt) {
  const at = (fraction) => Math.round(startedAt + s.durationMs * fraction);
  const first = s.platforms[0];
  const second = s.platforms[1] ?? first;
  const all = [
    [0.08, first, "follow", "lua_pixel", 1],
    [0.14, first, "sub", "capivara_live", 1],
    [0.21, first, "resub", "marina_dev", 14],
    [0.29, first, "bits", "joaogameplays", 2_500],
    [0.38, second, "member", "ana_no_chat", 1],
    [0.47, second, "superchat", "Carlos BR", 50],
    [0.58, first, "raid", "CanalDoNorte", s.viral ? 1_840 : 126],
    [0.66, first, "subgift", "MecenasAnonimo", 20],
    [0.74, first, "tip", "streamlabs_doador", 125.5],
  ];
  const picked =
    s.alerts === "all"
      ? all
      : s.alerts === "viral"
        ? all.slice(1)
        : s.alerts === "basic"
          ? [all[0], all[1], all[3]]
          : s.alerts === "legacy"
            ? [all[1], all[6]]
            : [];
  return picked.map(([fraction, p, kind, user, amount]) => ({
    kind: "alert",
    t: at(fraction),
    platform: kind === "tip" ? "streamlabs" : p.platformId,
    ...(!s.legacy && { source: p.name }),
    alertKind: kind,
    user,
    amount,
  }));
}

function recordingRows(s, startedAt, id) {
  const file = path.join(sessionsDir, `${id}.mp4`);
  if (s.video === "single") {
    return [
      {
        kind: "recording",
        seg: 1,
        t: startedAt + 500,
        path: file,
        codec: "h264",
        estimated: false,
      },
      { kind: "recSync", seg: 1, t: startedAt + 10_000, out: 9_500 },
      { kind: "recSync", seg: 1, t: startedAt + 20_000, out: 19_500 },
      { kind: "recEnd", seg: 1, t: startedAt + 29_500, reason: "stopped" },
      { kind: "recFinalized", seg: 1, path: file },
    ];
  }
  if (s.video === "multi") {
    const second = path.join(sessionsDir, `${id}.p2.mp4`);
    return [
      {
        kind: "recording",
        seg: 1,
        t: startedAt + 300,
        path: file,
        codec: "h264",
        estimated: false,
      },
      { kind: "recSync", seg: 1, t: startedAt + 8_000, out: 7_700 },
      { kind: "recEnd", seg: 1, t: startedAt + 12_300, reason: "died" },
      { kind: "recFinalized", seg: 1, path: file },
      {
        kind: "recording",
        seg: 2,
        t: startedAt + 15_000,
        path: second,
        codec: "h264",
        estimated: true,
      },
      { kind: "recSync", seg: 2, t: startedAt + 24_000, out: 9_000 },
      { kind: "recEnd", seg: 2, t: startedAt + 29_700, reason: "stopped" },
      { kind: "recFinalized", seg: 2, path: second },
    ];
  }
  if (s.video === "truncated") {
    return [
      {
        kind: "recording",
        seg: 1,
        t: startedAt + 300,
        path: file,
        codec: "h264",
        estimated: true,
      },
      { kind: "recSync", seg: 1, t: startedAt + 10_000, out: 9_700 },
      { kind: "recEnd", t: startedAt + 18_000, reason: "truncated" },
    ];
  }
  if (s.video === "missing") {
    return [
      {
        kind: "recording",
        seg: 1,
        t: startedAt + 500,
        path: file,
        codec: "h264",
        estimated: false,
      },
      {
        kind: "recEnd",
        seg: 1,
        t: startedAt + s.durationMs - 1_000,
        reason: "disk",
      },
    ];
  }
  return [];
}

// O ranking de processos que o app grava (top 3, ~6 s). Aqui: o app de fora do cenário
// com o recurso que ele pressiona (gpu/cpu/memory), e o OBS como segundo — moderado, ou
// pesado quando ELE é a história (`obsheavy`).
function appsFor(s, incident, pressure, cpu, gpu, random) {
  const obsHeavy =
    incident?.type === "obsheavy" || pressure?.type === "obsheavy";
  const obs = {
    appRef: "obs",
    name: "OBS Studio",
    cpu: round(cpu * 0.45, 1),
    memoryMb: 1380,
    gpu3d: round(obsHeavy ? 88 + random() * 4 : Math.min(gpu, 60), 1),
  };
  if (!s.appName) return [obs];
  const hot = Boolean(pressure);
  const resource = s.appResource ?? "gpu";
  const app = {
    appRef: String(s.appName).toLowerCase().replace(/\s+/g, "-"),
    name: s.appName,
    cpu: round(
      resource === "cpu"
        ? hot
          ? 78 + random() * 8
          : 18 + random() * 6
        : hot
          ? 42 + random() * 8
          : 24 + random() * 5,
      1,
    ),
    memoryMb: round(
      resource === "memory"
        ? hot
          ? 6100 + random() * 400
          : 2400 + random() * 300
        : 3600 + random() * 500,
      1,
    ),
    gpu3d: round(
      resource === "gpu"
        ? hot
          ? 95 + random() * 4
          : 54 + random() * 8
        : 12 + random() * 10,
      1,
    ),
  };
  return [app, obs];
}

function generateSession(s, index, now) {
  const endedAt = now - s.ago;
  const startedAt = endedAt - s.durationMs;
  const id = String(startedAt);
  const random = rngFor(10_000 + index);
  const rows = [
    {
      kind: "meta",
      schemaVersion: s.legacy ? 1 : 4,
      id,
      startedAt,
      mode: s.mode,
      platforms: s.platforms.map(({ id, name, platformId }) => ({
        id,
        name,
        platformId,
      })),
    },
    {
      kind: "marker",
      t: startedAt + Math.min(2_000, s.durationMs / 3),
      label: `CENÁRIO: ${s.title}`,
    },
  ];
  const drops = Array.from({ length: s.platforms.length }, () => 0);
  if (s.stepMs > 0) {
    for (let elapsed = 0; elapsed <= s.durationMs; elapsed += s.stepMs) {
      const progress = elapsed / s.durationMs;
      let cpu = 38 + 8 * Math.sin(progress * Math.PI * 4) + random() * 5;
      let gpu = 31 + 7 * Math.sin(progress * Math.PI * 5) + random() * 4;
      let memoryPct = 48 + 6 * Math.sin(progress * Math.PI * 3) + random() * 3;
      let congestion = random() * 0.06;
      let renderMs = 6.5 + random() * 3;
      let renderSkipped = 0;
      let outputSkipped = 0;
      const incident = s.incidents?.find((item) => within(progress, item));
      if (incident?.type === "encoding") {
        cpu = 96 + random() * 3;
        gpu = 94 + random() * 5;
        renderMs = 24 + random() * 8;
        renderSkipped = Math.round(80 * progress);
        outputSkipped = Math.round(55 * progress);
        memoryPct = 76 + random() * 5;
      } else if (incident?.type === "render") {
        cpu = 55 + random() * 6;
        gpu = 58 + random() * 8;
        renderMs = 31 + random() * 9;
        renderSkipped = Math.round(120 * progress);
      } else if (incident?.type === "appcpu") {
        // Processador tomado por um app de fora: o OBS deixa de CODIFICAR (não de montar).
        cpu = 95 + random() * 4;
        gpu = 44 + random() * 6;
        renderMs = 12 + random() * 4;
        outputSkipped = Math.round(90 * progress);
      } else if (incident?.type === "appmem") {
        // Memória no limite: o OBS engasga ao montar a cena.
        cpu = 62 + random() * 5;
        gpu = 51 + random() * 6;
        memoryPct = 94 + random() * 3;
        renderMs = 27 + random() * 6;
        renderSkipped = Math.round(70 * progress);
      } else if (incident?.type === "obsheavy") {
        // Sem app de fora: a placa está cheia e quem enche é o próprio OBS.
        cpu = 58 + random() * 6;
        gpu = 94 + random() * 4;
        renderMs = 29 + random() * 7;
        renderSkipped = Math.round(100 * progress);
      }
      // A pressão do aplicativo começa UM passo antes do impacto — é esse atraso que deixa o
      // relatório dizer "10s depois, o OBS pulou quadros" em vez de "aconteceu junto".
      const leadIn = s.stepMs / s.durationMs;
      const pressure = s.incidents?.find(
        (item) =>
          ["encoding", "appcpu", "appmem", "obsheavy"].includes(item.type) &&
          within(progress, { from: item.from - leadIn * 1.01, to: item.to }),
      );
      const targets = s.platforms.map((p, targetIndex) => {
        let state = elapsed < s.stepMs ? "connecting" : "live";
        let bitrate = p.bitrate * (0.96 + random() * 0.08);
        let fps = 60;
        for (const window of s.stateWindows ?? []) {
          if (within(progress, window)) state = window.state;
        }
        if (incident) {
          const affected =
            incident.target == null || incident.target === targetIndex;
          if (affected && incident.type === "network") {
            bitrate *= 0.3;
            if (progress < incident.from + 0.015) state = "reconnecting";
            drops[targetIndex] += 8;
          } else if (affected && incident.type === "platform") {
            bitrate *= 0.18;
            state = progress < incident.to - 0.015 ? "reconnecting" : "live";
            drops[targetIndex] += 12;
          } else if (affected && incident.type === "signal") {
            bitrate = 0;
            fps = 0;
            state = "signal-lost";
            drops[targetIndex] += 30;
          } else if (affected && incident.type === "error") {
            bitrate = 0;
            fps = 0;
            state = "error";
            drops[targetIndex] += 20;
          } else if (incident.type === "encoding") {
            bitrate *= 0.58;
            fps = 42 + Math.round(random() * 8);
            drops[targetIndex] += 5;
          } else if (
            incident.type === "appcpu" ||
            incident.type === "appmem" ||
            incident.type === "obsheavy"
          ) {
            bitrate *= 0.7;
            fps = 46 + Math.round(random() * 8);
            drops[targetIndex] += 4;
          }
        }
        if (state === "brb" || state === "censor") bitrate *= 0.72;
        return {
          id: p.id,
          name: p.name,
          state,
          bitrate: Math.max(0, Math.round(bitrate)),
          fps,
          dropped: drops[targetIndex],
        };
      });
      let chat = s.quiet
        ? random() > 0.9
          ? 1
          : 0
        : Math.round(1 + random() * 7);
      if (s.viral && Math.abs(progress - 0.58) < 0.1)
        chat += Math.round(35 + random() * 55);
      const chatBy = {};
      let remaining = chat;
      s.platforms.forEach((p, i) => {
        const share =
          i === s.platforms.length - 1
            ? remaining
            : Math.round(
                chat * (i === 0 ? 0.55 : 0.45 / (s.platforms.length - 1)),
              );
        remaining -= share;
        if (share > 0) chatBy[`${p.platformId}:${p.name}`] = share;
      });
      rows.push({
        kind: "sample",
        t: startedAt + elapsed,
        cpu: round(cpu, 1),
        gpu: round(gpu, 1),
        ...(!s.legacy && { memoryPct: round(memoryPct, 1) }),
        ...(!s.legacy &&
          (Math.round(elapsed / s.stepMs) % 3 === 0 || pressure) &&
          (s.appName ||
            incident?.type === "render" ||
            incident?.type === "obsheavy") && {
            apps: appsFor(s, incident, pressure, cpu, gpu, random),
          }),
        ...(!s.legacy && {
          obs: {
            activeFps: targets.some((target) => target.state === "signal-lost")
              ? 0
              : 60,
            avgRenderMs: round(renderMs, 1),
            renderSkipped,
            outputSkipped,
            congestion: round(congestion, 3),
          },
        }),
        chat,
        ...(!s.legacy && Object.keys(chatBy).length > 0 && { chatBy }),
        targets,
      });
    }
    const viewerEvery = Math.max(30_000, s.stepMs * 4);
    for (let elapsed = 0; elapsed <= s.durationMs; elapsed += viewerEvery) {
      const progress = elapsed / s.durationMs;
      const ramp = Math.min(1, progress / 0.18);
      const viralBoost =
        s.viral && progress >= 0.56
          ? 1_840 * Math.exp(-(progress - 0.56) * 3)
          : 0;
      const items = s.platforms
        .filter((p) => ["twitch", "youtube", "kick"].includes(p.platformId))
        .map((p, i) => ({
          platform: p.platformId,
          source: p.name,
          viewers: Math.max(
            0,
            Math.round(
              (s.quiet ? 5 : 70 + i * 34) * ramp * (0.88 + random() * 0.2) +
                viralBoost / (i + 1),
            ),
          ),
        }));
      rows.push({
        kind: "viewers",
        t: startedAt + elapsed,
        total: items.reduce((sum, item) => sum + item.viewers, 0),
        items,
      });
      if (!s.legacy) {
        const followers = items
          .filter(
            (item) => item.platform === "twitch" || item.platform === "kick",
          )
          .map((item, i) => ({
            ...item,
            total:
              12_400 +
              i * 4_100 +
              Math.round(progress * (s.viral ? 240 : s.quiet ? 1 : 26)),
          }));
        if (followers.length)
          rows.push({
            kind: "followers",
            t: startedAt + elapsed,
            items: followers,
          });
      }
    }
  }
  rows.push(...alertRows(s, startedAt));
  for (const [fraction, label] of s.markers ?? [])
    rows.push({
      kind: "marker",
      t: Math.round(startedAt + s.durationMs * fraction),
      label,
    });
  if (s.clockJump)
    rows.push({
      kind: "clockJump",
      t: Math.round(startedAt + s.durationMs * s.clockJump.at),
      delta: s.clockJump.delta,
    });
  if (s.offsetMs != null)
    rows.push({ kind: "offset", ms: -600 }, { kind: "offset", ms: s.offsetMs });
  rows.push(...recordingRows(s, startedAt, id));
  rows.push({ kind: "end", endedAt, ...(s.recovered && { recovered: true }) });
  rows.sort((a, b) => {
    if (a.kind === "meta") return -1;
    if (b.kind === "meta") return 1;
    if (a.kind === "end") return 1;
    if (b.kind === "end") return -1;
    return Number(a.t ?? startedAt) - Number(b.t ?? startedAt);
  });
  return { id, startedAt, endedAt, rows };
}

function generateChat(s, startedAt, id, random) {
  if (!s.chatReplay) return null;
  const messages = s.viral ? 220 : 72;
  const rows = [];
  const authors = [
    "capivara_live",
    "ana_no_chat",
    "mod_rafa",
    "joaogameplays",
    "lurker_42",
    "marina_dev",
  ];
  const texts = [
    "boa live!",
    "kkkkkkkk",
    "clipa isso",
    "salve do interior 👋",
    "qual é o setup?",
    "essa jogada foi absurda",
    "vim pela raid",
    "o áudio está ótimo",
    "GG demais",
    "primeira vez aqui ❤️",
  ];
  for (let i = 0; i < messages; i++) {
    const p = s.platforms[i % s.platforms.length];
    const nativeId = `fixture_${id}_${i}`;
    rows.push({
      t: Math.round(startedAt + ((i + 1) / (messages + 1)) * s.durationMs),
      p: ["twitch", "youtube", "kick"].includes(p.platformId)
        ? p.platformId
        : "twitch",
      s: p.name,
      a: authors[i % authors.length],
      c: ["#9147ff", "#ff4f64", "#53fc18", "#f4bf47"][i % 4],
      m: texts[Math.floor(random() * texts.length)],
      i: nativeId,
    });
    if (i === 18)
      rows.push({ t: startedAt + s.durationMs * 0.3, del: nativeId });
  }
  rows.push({
    t: startedAt + s.durationMs * 0.52,
    gap: startedAt + s.durationMs * 0.48,
  });
  return rows.sort((a, b) => a.t - b.t);
}

function createVideo(file, seconds, frequency) {
  const result = spawnSync(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=640x360:rate=30",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${frequency}:sample_rate=48000`,
      "-t",
      String(seconds),
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "32",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-movflags",
      "+faststart",
      "-shortest",
      file,
    ],
    { encoding: "utf8" },
  );
  if (
    result.status !== 0 ||
    !fs.existsSync(file) ||
    fs.statSync(file).size === 0
  ) {
    throw new Error(
      `FFmpeg não criou ${file}: ${result.stderr || result.error}`,
    );
  }
}

if (!fs.existsSync(ffmpeg))
  throw new Error(`FFmpeg empacotado não encontrado: ${ffmpeg}`);

const now = Date.now();
const generatedFiles = [];
const catalog = [];
for (const [index, scenario] of scenarios.entries()) {
  const generated = generateSession(scenario, index, now);
  const reportFile = path.join(sessionsDir, `${generated.id}.ndjson`);
  if (fs.existsSync(reportFile))
    throw new Error(`ID de fixture colidiu: ${generated.id}`);
  fs.writeFileSync(
    reportFile,
    `${generated.rows.map(line).join("\n")}\n`,
    "utf8",
  );
  fs.utimesSync(
    reportFile,
    generated.endedAt / 1_000,
    generated.endedAt / 1_000,
  );
  generatedFiles.push(reportFile);
  const chatRows = generateChat(
    scenario,
    generated.startedAt,
    generated.id,
    rngFor(index + 90_000),
  );
  if (chatRows) {
    const chatFile = path.join(sessionsDir, `${generated.id}.chat.ndjson`);
    fs.writeFileSync(chatFile, `${chatRows.map(line).join("\n")}\n`, "utf8");
    fs.utimesSync(
      chatFile,
      generated.endedAt / 1_000,
      generated.endedAt / 1_000,
    );
    generatedFiles.push(chatFile);
  }
  if (scenario.video === "single") {
    const file = path.join(sessionsDir, `${generated.id}.mp4`);
    createVideo(file, 30, 440);
    generatedFiles.push(file);
  } else if (scenario.video === "multi") {
    const first = path.join(sessionsDir, `${generated.id}.mp4`);
    const second = path.join(sessionsDir, `${generated.id}.p2.mp4`);
    createVideo(first, 12, 523);
    createVideo(second, 15, 659);
    generatedFiles.push(first, second);
  } else if (scenario.video === "truncated") {
    const file = path.join(sessionsDir, `${generated.id}.mp4`);
    createVideo(file, 18, 330);
    generatedFiles.push(file);
  }
  catalog.push({
    id: generated.id,
    slug: scenario.slug,
    title: scenario.title,
    startedAt: new Date(generated.startedAt).toISOString(),
    durationSec: Math.round(scenario.durationMs / 1_000),
    video: scenario.video ?? "none",
    chatReplay: Boolean(scenario.chatReplay),
    note: scenario.note,
  });
}

for (const item of catalog) {
  const report = path.join(sessionsDir, `${item.id}.ndjson`);
  const rows = fs
    .readFileSync(report, "utf8")
    .trim()
    .split("\n")
    .map((raw) => JSON.parse(raw));
  if (
    rows[0]?.kind !== "meta" ||
    rows[0]?.id !== item.id ||
    rows.at(-1)?.kind !== "end"
  ) {
    throw new Error(`Contrato NDJSON inválido em ${report}`);
  }
}
for (const file of generatedFiles.filter((value) => value.endsWith(".mp4"))) {
  if (fs.statSync(file).size === 0) throw new Error(`Vídeo vazio: ${file}`);
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sessionsDir,
  backupDir,
  generatedFiles,
  scenarios: catalog,
};
fs.writeFileSync(
  manifestPath,
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
const guide = [
  "# Relatórios fictícios da Corneta",
  "",
  `Gerados em ${manifest.generatedAt}.`,
  "",
  `Backup anterior: \`${backupDir}\``,
  "",
  "| Data/hora | Cenário | Vídeo | Chat gravado | O que observar |",
  "| --- | --- | --- | --- | --- |",
  ...catalog.map(
    (item) =>
      `| ${new Date(item.startedAt).toLocaleString("pt-BR")} | ${item.title} | ${item.video} | ${item.chatReplay ? "sim" : "não"} | ${item.note} |`,
  ),
  "",
  "Para remover somente estes fixtures: `pnpm reports:fixtures:clean`.",
  "",
].join("\n");
fs.writeFileSync(guidePath, guide, "utf8");

console.table(
  catalog.map(({ id, title, video, chatReplay }) => ({
    id,
    cenário: title,
    vídeo: video,
    chat: chatReplay ? "sim" : "não",
  })),
);
console.log(`\n${catalog.length} relatórios criados em ${sessionsDir}`);
console.log(`Backup preservado em ${backupDir}`);
console.log(`Guia detalhado em ${guidePath}`);
