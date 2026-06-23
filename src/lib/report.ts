// ============================================================
// Relatório pós-live: parse do NDJSON + análise (eventos, janelas
// problemáticas, veredito). Ver docs/RELATORIO-POS-LIVE.md.
// ============================================================
import type {
  PlatformId,
  SessionData,
  SessionMarker,
  SessionMeta,
  SessionSample,
} from "./types";

type RawLine = { kind?: string; [k: string]: unknown };

/** Converte o NDJSON cru numa sessão estruturada. */
export function parseSession(ndjson: string): SessionData | null {
  const lines = ndjson.split("\n").map((l) => l.trim()).filter(Boolean);
  let meta: SessionMeta | null = null;
  const samples: SessionSample[] = [];
  const markers: SessionMarker[] = [];
  let endedAt: number | undefined;

  for (const line of lines) {
    let o: RawLine;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.kind === "meta") {
      meta = {
        id: String(o.id),
        startedAt: Number(o.startedAt),
        durationSec: 0,
        mode: (o.mode ?? "per-platform") as SessionMeta["mode"],
        platforms: (o.platforms ?? []) as SessionMeta["platforms"],
      };
    } else if (o.kind === "sample") {
      samples.push({
        t: Number(o.t),
        cpu: o.cpu == null ? undefined : Number(o.cpu),
        gpu: o.gpu == null ? undefined : Number(o.gpu),
        obs: o.obs == null ? undefined : (o.obs as SessionSample["obs"]),
        targets: (o.targets ?? []) as SessionSample["targets"],
      });
    } else if (o.kind === "marker") {
      markers.push({ t: Number(o.t), label: String(o.label ?? "Momento") });
    } else if (o.kind === "end") {
      endedAt = Number(o.endedAt);
    }
  }

  if (!meta) return null;
  const last = samples.length ? samples[samples.length - 1].t : meta.startedAt;
  const end = endedAt ?? last;
  meta.endedAt = end;
  meta.durationSec = Math.max(0, Math.round((end - meta.startedAt) / 1000));
  return { meta, samples, markers };
}

// ---------------------------------------------------------------------------
// Séries para os gráficos
// ---------------------------------------------------------------------------
export const timeAxis = (d: SessionData): number[] => d.samples.map((s) => s.t);
export const cpuSeries = (d: SessionData): (number | null)[] =>
  d.samples.map((s) => s.cpu ?? null);
export const gpuSeries = (d: SessionData): (number | null)[] =>
  d.samples.map((s) => s.gpu ?? null);
export function bitrateSeries(d: SessionData, targetId: string): (number | null)[] {
  return d.samples.map((s) => {
    const t = s.targets.find((x) => x.id === targetId);
    return t ? t.bitrate : null;
  });
}
export const hasObs = (d: SessionData): boolean => d.samples.some((s) => s.obs != null);
export const obsCongestionSeries = (d: SessionData): (number | null)[] =>
  d.samples.map((s) => (s.obs ? Math.round(s.obs.congestion * 100) : null));
export const obsRenderSeries = (d: SessionData): (number | null)[] =>
  d.samples.map((s) => (s.obs ? s.obs.avgRenderMs : null));

// ---------------------------------------------------------------------------
// Análise
// ---------------------------------------------------------------------------
export interface ReportEvent {
  t: number;
  kind: "start" | "end" | "reconnect" | "error" | "recover" | "cpu" | "marker";
  label: string;
}

export interface ProblemWindow {
  tStart: number;
  tEnd: number;
  durationSec: number;
  signals: string[];
  cause: string;
  advice: string;
  targetName?: string;
}

export interface ReportAnalysis {
  events: ReportEvent[];
  windows: ProblemWindow[];
  verdict: { tone: "ok" | "warn" | "bad"; title: string; detail: string };
  avgCpu: number | null;
  maxCpu: number | null;
  avgGpu: number | null;
  maxGpu: number | null;
  perTarget: {
    id: string;
    name: string;
    platformId: PlatformId;
    avgBitrate: number;
    minBitrate: number;
    maxDropped: number;
    reconnects: number;
  }[];
}

const CPU_HIGH = 92;
const BITRATE_DROP = 0.6; // < 60% do típico = queda
const OBS_CONGEST = 0.3; // congestionamento de saída > 30%
const OBS_RENDER_MS = 25; // render lag do OBS acima disso = cena pesada

/** Bitrate "típico" (mediana) por destino, considerando só amostras no ar. */
function typicalBitrates(samples: SessionSample[]): Record<string, number> {
  const byId: Record<string, number[]> = {};
  for (const s of samples)
    for (const t of s.targets)
      if (t.state === "live") (byId[t.id] ??= []).push(t.bitrate);
  const out: Record<string, number> = {};
  for (const [id, arr] of Object.entries(byId)) {
    arr.sort((a, b) => a - b);
    out[id] = arr[Math.floor(arr.length / 2)] ?? 0;
  }
  return out;
}

function isBad(s: SessionSample, typical: Record<string, number>): boolean {
  for (const t of s.targets) {
    if (t.state === "reconnecting" || t.state === "error") return true;
    const typ = typical[t.id];
    if (typ && t.bitrate < typ * BITRATE_DROP) return true;
  }
  if (s.cpu != null && s.cpu > CPU_HIGH) return true;
  if (s.obs && (s.obs.congestion > OBS_CONGEST || s.obs.avgRenderMs > OBS_RENDER_MS)) return true;
  return false;
}

function buildWindow(
  slice: SessionSample[],
  totalTargets: number,
  typical: Record<string, number>
): ProblemWindow {
  const tStart = slice[0].t;
  const tEnd = slice[slice.length - 1].t;
  let maxCpu = 0;
  let maxGpu = 0;
  let maxCongestion = 0;
  let maxRenderMs = 0;
  let reconnect = false;
  let bitrateDrop = false;
  const affected = new Set<string>();

  for (const s of slice) {
    if (s.cpu != null) maxCpu = Math.max(maxCpu, s.cpu);
    if (s.gpu != null) maxGpu = Math.max(maxGpu, s.gpu);
    if (s.obs) {
      maxCongestion = Math.max(maxCongestion, s.obs.congestion);
      maxRenderMs = Math.max(maxRenderMs, s.obs.avgRenderMs);
    }
    for (const t of s.targets) {
      const typ = typical[t.id];
      if (t.state === "reconnecting" || t.state === "error") {
        reconnect = true;
        affected.add(t.name);
      }
      if (typ && t.bitrate < typ * BITRATE_DROP) {
        bitrateDrop = true;
        affected.add(t.name);
      }
    }
  }

  const cpuHigh = maxCpu > CPU_HIGH;
  const gpuHigh = maxGpu > CPU_HIGH;
  const congested = maxCongestion > OBS_CONGEST;
  const renderLag = maxRenderMs > OBS_RENDER_MS;
  const singleTarget = affected.size === 1 && totalTargets > 1;

  const signals: string[] = [];
  if (reconnect) signals.push(`${[...affected].join(", ")} reconectou`);
  if (bitrateDrop) signals.push("bitrate caiu");
  if (cpuHigh) signals.push(`CPU ${Math.round(maxCpu)}%`);
  if (gpuHigh) signals.push(`GPU ${Math.round(maxGpu)}%`);
  if (renderLag) signals.push(`OBS render ${Math.round(maxRenderMs)}ms`);
  if (congested) signals.push(`OBS congestionado ${Math.round(maxCongestion * 100)}%`);

  let cause = "Causa indeterminada";
  let advice = "Veja os sinais desta janela.";
  if (renderLag && !cpuHigh && !gpuHigh) {
    cause = "Cena pesada no OBS (render lag)";
    advice = "Alivie a cena (fontes/efeitos/filtros) ou baixe a resolução base no OBS.";
  } else if (cpuHigh || gpuHigh) {
    cause = "Gargalo de encoding";
    advice = "Reduza o bitrate/resolução ou use um encoder de hardware (NVENC/QSV).";
  } else if (congested || ((bitrateDrop || reconnect) && !singleTarget)) {
    cause = "Gargalo de rede/upload";
    advice = "Reduza o bitrate total ou tire uma plataforma.";
  } else if (singleTarget) {
    cause = `Instabilidade em ${[...affected][0]}`;
    advice = "Provavelmente do lado da plataforma (ingest/chave). Confira a chave e o status dela.";
  }

  return {
    tStart,
    tEnd,
    durationSec: Math.max(1, Math.round((tEnd - tStart) / 1000)),
    signals,
    cause,
    advice,
    targetName: affected.size === 1 ? [...affected][0] : undefined,
  };
}

function problemWindows(
  data: SessionData,
  typical: Record<string, number>
): ProblemWindow[] {
  const { samples } = data;
  const flags = samples.map((s) => isBad(s, typical));

  // Agrupa amostras ruins consecutivas em intervalos.
  const ranges: [number, number][] = [];
  let start = -1;
  for (let k = 0; k <= samples.length; k++) {
    const bad = k < samples.length && flags[k];
    if (bad && start < 0) start = k;
    if (!bad && start >= 0) {
      ranges.push([start, k - 1]);
      start = -1;
    }
  }
  // Funde intervalos separados por ≤1 amostra boa (ruído).
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const prev = merged[merged.length - 1];
    if (prev && r[0] - prev[1] <= 2) prev[1] = r[1];
    else merged.push([...r]);
  }

  const totalTargets = data.meta.platforms.length || 1;
  return merged.map(([a, b]) => buildWindow(samples.slice(a, b + 1), totalTargets, typical));
}

function deriveEvents(data: SessionData): ReportEvent[] {
  const { meta, samples } = data;
  const events: ReportEvent[] = [
    { t: meta.startedAt, kind: "start", label: "Início da transmissão" },
  ];
  const prev: Record<string, string> = {};
  let prevCpuHigh = false;

  for (const s of samples) {
    for (const t of s.targets) {
      const was = prev[t.id] ?? "live";
      if ((t.state === "reconnecting" || t.state === "error") && was === "live") {
        events.push({
          t: s.t,
          kind: t.state === "error" ? "error" : "reconnect",
          label: `${t.name} ${t.state === "error" ? "com erro" : "reconectou"}`,
        });
      } else if (t.state === "live" && (was === "reconnecting" || was === "error")) {
        events.push({ t: s.t, kind: "recover", label: `${t.name} voltou` });
      }
      prev[t.id] = t.state;
    }
    const cpuHigh = s.cpu != null && s.cpu > CPU_HIGH;
    if (cpuHigh && !prevCpuHigh)
      events.push({ t: s.t, kind: "cpu", label: `CPU em ${Math.round(s.cpu as number)}%` });
    prevCpuHigh = cpuHigh;
  }

  if (meta.endedAt) events.push({ t: meta.endedAt, kind: "end", label: "Fim da transmissão" });
  for (const m of data.markers) {
    events.push({ t: m.t, kind: "marker", label: `📍 ${m.label}` });
  }
  events.sort((a, b) => a.t - b.t);
  return events;
}

function aggregates(data: SessionData) {
  const { meta, samples } = data;
  const cpus = samples.map((s) => s.cpu).filter((x): x is number => x != null);
  const gpus = samples.map((s) => s.gpu).filter((x): x is number => x != null);
  const platOf = (id: string): PlatformId =>
    (meta.platforms.find((p) => p.id === id)?.platformId ?? "custom") as PlatformId;

  const byId: Record<
    string,
    { name: string; brs: number[]; maxDropped: number; reconnects: number; prev: string }
  > = {};
  for (const s of samples)
    for (const t of s.targets) {
      const e = (byId[t.id] ??= { name: t.name, brs: [], maxDropped: 0, reconnects: 0, prev: "live" });
      if (t.state === "live") e.brs.push(t.bitrate);
      e.maxDropped = Math.max(e.maxDropped, t.dropped);
      if ((t.state === "reconnecting" || t.state === "error") && e.prev === "live") e.reconnects++;
      e.prev = t.state;
    }

  const perTarget = Object.entries(byId).map(([id, e]) => ({
    id,
    name: e.name,
    platformId: platOf(id),
    avgBitrate: e.brs.length ? Math.round(e.brs.reduce((a, b) => a + b, 0) / e.brs.length) : 0,
    minBitrate: e.brs.length ? Math.min(...e.brs) : 0,
    maxDropped: e.maxDropped,
    reconnects: e.reconnects,
  }));

  const avg = (a: number[]) =>
    a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null;
  return {
    avgCpu: avg(cpus),
    maxCpu: cpus.length ? Math.max(...cpus) : null,
    avgGpu: avg(gpus),
    maxGpu: gpus.length ? Math.max(...gpus) : null,
    perTarget,
  };
}

function buildVerdict(windows: ProblemWindow[]): ReportAnalysis["verdict"] {
  if (!windows.length)
    return { tone: "ok", title: "Transmissão limpa", detail: "Nenhum incidente detectado nesta sessão." };
  const enc = windows.filter((w) => w.cause.startsWith("Gargalo de encoding")).length;
  const render = windows.filter((w) => w.cause.startsWith("Cena pesada")).length;
  const net = windows.filter((w) => w.cause.startsWith("Gargalo de rede")).length;
  const plat = windows.filter((w) => w.cause.startsWith("Instabilidade")).length;
  if (enc)
    return {
      tone: "bad",
      title: "Provável gargalo de ENCODING",
      detail: `${enc} janela(s) com CPU/GPU saturada. Reduza bitrate/resolução ou use encoder de hardware.`,
    };
  if (render)
    return {
      tone: "warn",
      title: "Provável CENA PESADA no OBS",
      detail: `${render} janela(s) com render lag do OBS — alivie a cena ou baixe a resolução base.`,
    };
  if (net)
    return {
      tone: "bad",
      title: "Provável gargalo de REDE/UPLOAD",
      detail: `${net} janela(s) com queda de bitrate/reconexão sem CPU alta. Reduza o bitrate ou tire uma plataforma.`,
    };
  if (plat)
    return {
      tone: "warn",
      title: "Instabilidade de plataforma",
      detail: `${plat} janela(s) afetando um destino só — provavelmente do lado da plataforma.`,
    };
  return {
    tone: "warn",
    title: `${windows.length} janela(s) problemática(s)`,
    detail: "Veja os detalhes de cada uma abaixo.",
  };
}

export function analyze(data: SessionData): ReportAnalysis {
  const typical = typicalBitrates(data.samples);
  const windows = problemWindows(data, typical);
  return {
    events: deriveEvents(data),
    windows,
    verdict: buildVerdict(windows),
    ...aggregates(data),
  };
}
