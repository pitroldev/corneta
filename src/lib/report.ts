// ============================================================
// Relatório pós-live: parse do NDJSON + análise (eventos, janelas
// problemáticas, veredito). Ver docs/RELATORIO-POS-LIVE.md.
// ============================================================
import type {
  AlertKind,
  ChatPlatform,
  PlatformId,
  SessionAlertEvent,
  SessionData,
  SessionMarker,
  SessionMeta,
  SessionSample,
  SessionSummary,
  SessionViewerSample,
} from "./types";

type RawLine = { kind?: string; [k: string]: unknown };

/** Converte o NDJSON cru numa sessão estruturada. */
export function parseSession(ndjson: string): SessionData | null {
  const lines = ndjson
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let meta: SessionMeta | null = null;
  const samples: SessionSample[] = [];
  const markers: SessionMarker[] = [];
  const viewerSamples: SessionViewerSample[] = [];
  const alertEvents: SessionAlertEvent[] = [];
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
      const t = Number(o.t);
      if (!Number.isFinite(t)) continue;
      samples.push({
        t,
        cpu: o.cpu == null ? undefined : Number(o.cpu),
        gpu: o.gpu == null ? undefined : Number(o.gpu),
        obs: o.obs == null ? undefined : (o.obs as SessionSample["obs"]),
        chat: o.chat == null ? undefined : Number(o.chat),
        targets: (o.targets ?? []) as SessionSample["targets"],
      });
    } else if (o.kind === "viewers") {
      const t = Number(o.t);
      if (!Number.isFinite(t)) continue;
      viewerSamples.push({
        t,
        total: Number(o.total) || 0,
        items: (o.items ?? []) as SessionViewerSample["items"],
      });
    } else if (o.kind === "alert") {
      const t = Number(o.t);
      if (!Number.isFinite(t)) continue;
      alertEvents.push({
        t,
        platform: o.platform as ChatPlatform,
        kind: o.alertKind as AlertKind,
        user: String(o.user ?? "alguém"),
        amount: o.amount == null ? undefined : Number(o.amount),
      });
    } else if (o.kind === "marker") {
      const t = Number(o.t);
      if (Number.isFinite(t))
        markers.push({ t, label: String(o.label ?? "Momento") });
    } else if (o.kind === "end") {
      const e = Number(o.endedAt);
      if (Number.isFinite(e)) endedAt = e;
    }
  }

  if (!meta || !Number.isFinite(meta.startedAt)) return null;
  const last = samples.length ? samples[samples.length - 1].t : meta.startedAt;
  // endedAt só existe com o registro "end" — sessão AINDA NO AR fica sem, e o
  // ReportsScreen usa isso pra não gravar resumo parcial no cache.
  meta.endedAt = endedAt;
  meta.durationSec = Math.max(
    0,
    Math.round(((endedAt ?? last) - meta.startedAt) / 1000),
  );
  return { meta, samples, markers, viewerSamples, alertEvents };
}

// ---------------------------------------------------------------------------
// Séries para os gráficos
// ---------------------------------------------------------------------------
export const timeAxis = (d: SessionData): number[] => d.samples.map((s) => s.t);
export const cpuSeries = (d: SessionData): (number | null)[] =>
  d.samples.map((s) => s.cpu ?? null);
export const gpuSeries = (d: SessionData): (number | null)[] =>
  d.samples.map((s) => s.gpu ?? null);
export function bitrateSeries(
  d: SessionData,
  targetId: string,
): (number | null)[] {
  return d.samples.map((s) => {
    const t = s.targets.find((x) => x.id === targetId);
    return t ? t.bitrate : null;
  });
}
export const hasObs = (d: SessionData): boolean =>
  d.samples.some((s) => s.obs != null);
export const obsCongestionSeries = (d: SessionData): (number | null)[] =>
  d.samples.map((s) => (s.obs ? Math.round(s.obs.congestion * 100) : null));
export const obsRenderSeries = (d: SessionData): (number | null)[] =>
  d.samples.map((s) => (s.obs ? s.obs.avgRenderMs : null));

/** Audiência somada (todas as plataformas) ao longo do tempo. */
export const viewerSeries = (d: SessionData): (number | null)[] =>
  d.viewerSamples.map((s) => s.total);

/** Taxa de chat em mensagens/min, por amostra (~2s). */
export function chatRateSeries(d: SessionData): (number | null)[] {
  const s = d.samples;
  return s.map((x, i) => {
    if (x.chat == null) return null;
    const dt = i > 0 ? (x.t - s[i - 1].t) / 1000 : 2;
    return dt > 0 ? Math.round((x.chat * 60) / dt) : 0;
  });
}
export const hasChat = (d: SessionData): boolean =>
  d.samples.some((s) => (s.chat ?? 0) > 0);

// ---------------------------------------------------------------------------
// Análise
// ---------------------------------------------------------------------------
export interface ReportEvent {
  t: number;
  kind:
    | "start"
    | "end"
    | "reconnect"
    | "error"
    | "recover"
    | "cpu"
    | "marker"
    | "signal";
  label: string;
}

/** Estados de destino que contam como problema (mesma régua em toda a análise). */
const isProblemState = (state: string): boolean =>
  state === "reconnecting" || state === "error" || state === "signal-lost";

export interface ProblemWindow {
  tStart: number;
  tEnd: number;
  durationSec: number;
  signals: string[];
  cause: string;
  /** Classificação estável da causa (o texto de `cause` é copy, pode mudar). */
  causeKind:
    "render" | "encoding" | "network" | "platform" | "signal" | "unknown";
  advice: string;
  targetName?: string;
}

export interface ViewerStats {
  peak: number;
  avg: number;
  start: number;
  end: number;
  /** Audiência por plataforma no pico (último item de cada). */
  byPlatform: { platform: ChatPlatform; source: string; peak: number }[];
  hasData: boolean;
}

export interface ChatStats {
  total: number;
  peakPerMin: number;
  avgPerMin: number;
  hasData: boolean;
}

export interface AlertStats {
  total: number;
  byKind: Record<string, number>;
  subs: number;
  bits: number;
  raids: number;
  raidViewers: number;
  topRaid?: { user: string; amount: number };
  hasData: boolean;
}

export interface Highlight {
  t: number;
  kind: "chat" | "raid" | "viewers" | "alert";
  reason: string;
  score: number;
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
  viewers: ViewerStats;
  chat: ChatStats;
  alerts: AlertStats;
  highlights: Highlight[];
}

const CPU_HIGH = 92;
const BITRATE_DROP = 0.6; // < 60% do típico = queda
const OBS_CONGEST = 0.3; // congestionamento de saída > 30%
const OBS_RENDER_MS = 25; // render lag do OBS acima disso = cena pesada
// Sinais LEVES (bitrate/congestion/render/CPU) só viram "trecho com problema" se
// persistirem — um blip de 1 amostra (~2s) não é incidente que espectador percebe.
const SOFT_WINDOW_MIN_MS = 10_000;
// Warm-up: primeiras amostras "live" de um destino têm a média de bitrate do FFmpeg
// ainda subindo do zero — comparar com a mediana acusava "queda" em TODO começo de live.
const WARMUP_LIVE_SAMPLES = 8; // ~16s
// Antes do PRIMEIRO "live" de um destino, reconexão é setup (ninguém assistindo ainda).

const maxOf = (a: number[]) => a.reduce((m, v) => (v > m ? v : m), -Infinity);
const minOf = (a: number[]) => a.reduce((m, v) => (v < m ? v : m), Infinity);

/** Contexto por destino em cada amostra: separa incidente real de ruído de partida. */
interface TargetCtx {
  /** Já esteve "live" ao menos uma vez — antes disso, reconexão é SETUP, não queda. */
  everLive: boolean;
  /** Live há amostras suficientes (média de bitrate do FFmpeg já aquecida). */
  warm: boolean;
}

/** Pré-computa everLive/warm por amostra×destino (warm zera quando sai do ar). */
function targetCtxs(
  samples: SessionSample[],
): Array<Record<string, TargetCtx>> {
  const everLive: Record<string, boolean> = {};
  const liveRun: Record<string, number> = {};
  return samples.map((s) => {
    const m: Record<string, TargetCtx> = {};
    for (const t of s.targets) {
      if (t.state === "live") {
        everLive[t.id] = true;
        liveRun[t.id] = (liveRun[t.id] ?? 0) + 1;
      } else {
        liveRun[t.id] = 0;
      }
      m[t.id] = {
        everLive: everLive[t.id] ?? false,
        warm: (liveRun[t.id] ?? 0) > WARMUP_LIVE_SAMPLES,
      };
    }
    return m;
  });
}

/** Bitrate "típico" (mediana) por destino — só de amostras aquecidas, senão o warm-up
 *  puxa a mediana e o começo de TODA live vira "queda". */
function typicalBitrates(
  samples: SessionSample[],
  ctxs: Array<Record<string, TargetCtx>>,
): Record<string, number> {
  const byId: Record<string, number[]> = {};
  samples.forEach((s, i) => {
    for (const t of s.targets)
      if (t.state === "live" && ctxs[i][t.id]?.warm)
        (byId[t.id] ??= []).push(t.bitrate);
  });
  const out: Record<string, number> = {};
  for (const [id, arr] of Object.entries(byId)) {
    arr.sort((a, b) => a - b);
    out[id] = arr[Math.floor(arr.length / 2)] ?? 0;
  }
  return out;
}

function isBad(
  s: SessionSample,
  typical: Record<string, number>,
  ctx: Record<string, TargetCtx>,
): boolean {
  for (const t of s.targets) {
    // Problema de estado só conta DEPOIS do destino ter ido ao ar — o ciclo
    // conectar→tentar de novo da partida acusava "reconectou" em toda live.
    if (isProblemState(t.state) && ctx[t.id]?.everLive) return true;
    const typ = typical[t.id];
    if (
      t.state === "live" &&
      ctx[t.id]?.warm &&
      typ &&
      t.bitrate < typ * BITRATE_DROP
    )
      return true;
  }
  if (s.cpu != null && s.cpu > CPU_HIGH) return true;
  if (s.gpu != null && s.gpu > CPU_HIGH) return true;
  if (
    s.obs &&
    (s.obs.congestion > OBS_CONGEST || s.obs.avgRenderMs > OBS_RENDER_MS)
  )
    return true;
  return false;
}

function buildWindow(
  slice: SessionSample[],
  sliceCtxs: Array<Record<string, TargetCtx>>,
  totalTargets: number,
  typical: Record<string, number>,
): ProblemWindow {
  const tStart = slice[0].t;
  const tEnd = slice[slice.length - 1].t;
  let maxCpu = 0;
  let maxGpu = 0;
  let maxCongestion = 0;
  let maxRenderMs = 0;
  let reconnect = false;
  let bitrateDrop = false;
  let signalLost = false;
  const affected = new Set<string>();

  slice.forEach((s, i) => {
    if (s.cpu != null) maxCpu = Math.max(maxCpu, s.cpu);
    if (s.gpu != null) maxGpu = Math.max(maxGpu, s.gpu);
    if (s.obs) {
      maxCongestion = Math.max(maxCongestion, s.obs.congestion);
      maxRenderMs = Math.max(maxRenderMs, s.obs.avgRenderMs);
    }
    for (const t of s.targets) {
      const ctx = sliceCtxs[i][t.id];
      const typ = typical[t.id];
      if (t.state === "signal-lost") {
        signalLost = true;
        affected.add(t.name);
      } else if (
        (t.state === "reconnecting" || t.state === "error") &&
        ctx?.everLive
      ) {
        reconnect = true;
        affected.add(t.name);
      }
      if (
        t.state === "live" &&
        ctx?.warm &&
        typ &&
        t.bitrate < typ * BITRATE_DROP
      ) {
        bitrateDrop = true;
        affected.add(t.name);
      }
    }
  });

  const cpuHigh = maxCpu > CPU_HIGH;
  const gpuHigh = maxGpu > CPU_HIGH;
  const congested = maxCongestion > OBS_CONGEST;
  const renderLag = maxRenderMs > OBS_RENDER_MS;
  const singleTarget = affected.size === 1 && totalTargets > 1;

  const signals: string[] = [];
  if (signalLost) signals.push("sem sinal do OBS");
  if (reconnect) signals.push(`${[...affected].join(", ")} reconectou`);
  if (bitrateDrop) signals.push("bitrate caiu");
  if (cpuHigh) signals.push(`CPU ${Math.round(maxCpu)}%`);
  if (gpuHigh) signals.push(`GPU ${Math.round(maxGpu)}%`);
  if (renderLag) signals.push(`OBS render ${Math.round(maxRenderMs)}ms`);
  if (congested)
    signals.push(`OBS congestionado ${Math.round(maxCongestion * 100)}%`);

  // Copy em português de streamer: o que houve + passo concreto, termo técnico entre parênteses.
  let cause = "Causa indeterminada";
  let causeKind: ProblemWindow["causeKind"] = "unknown";
  let advice = "Veja os sinais deste trecho.";
  if (signalLost) {
    cause = "O sinal do OBS caiu (sem vídeo chegando)";
    causeKind = "signal";
    advice =
      "Confere se o OBS ficou aberto, transmitindo e apontando pra Corneta — nesse trecho a galera ficou sem imagem.";
  } else if (renderLag && !cpuHigh && !gpuHigh) {
    cause = "Cena pesada no OBS (render lag)";
    causeKind = "render";
    advice =
      "Alivie a cena no OBS — menos fontes, filtros e efeitos — ou baixe a resolução base lá.";
  } else if (cpuHigh || gpuHigh) {
    cause = "Seu PC não deu conta de gerar o vídeo (encoding)";
    causeKind = "encoding";
    advice =
      "No OBS: Configurações → Saída → Encoder → escolha o da placa de vídeo (NVENC/QSV). Ou baixe o bitrate/resolução na tela Qualidade.";
  } else if (congested || ((bitrateDrop || reconnect) && !singleTarget)) {
    cause = "A internet não deu conta do upload";
    causeKind = "network";
    advice =
      "Baixe o bitrate na tela Qualidade ou tire uma plataforma da live.";
  } else if (singleTarget) {
    cause = `Instabilidade em ${[...affected][0]}`;
    causeKind = "platform";
    advice =
      "Provavelmente foi do lado da plataforma (o servidor dela, não você). Confira a chave e o status dela.";
  }

  return {
    tStart,
    tEnd,
    durationSec: Math.max(1, Math.round((tEnd - tStart) / 1000)),
    signals,
    cause,
    causeKind,
    advice,
    targetName: affected.size === 1 ? [...affected][0] : undefined,
  };
}

function problemWindows(
  data: SessionData,
  typical: Record<string, number>,
  ctxs: Array<Record<string, TargetCtx>>,
): ProblemWindow[] {
  const { samples } = data;
  const flags = samples.map((s, i) => isBad(s, typical, ctxs[i]));

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
  return merged
    .filter(([a, b]) => {
      // Sinal DURO (queda de estado real) vale em qualquer duração; sinal leve
      // (bitrate/congestion/render/CPU) só vira incidente se PERSISTIR — um blip
      // de 2s pintava o veredito de vermelho sem espectador ter visto nada.
      const hard = samples
        .slice(a, b + 1)
        .some((s, i) =>
          s.targets.some(
            (t) => isProblemState(t.state) && ctxs[a + i][t.id]?.everLive,
          ),
        );
      return hard || samples[b].t - samples[a].t >= SOFT_WINDOW_MIN_MS;
    })
    .map(([a, b]) =>
      buildWindow(
        samples.slice(a, b + 1),
        ctxs.slice(a, b + 1),
        totalTargets,
        typical,
      ),
    );
}

function deriveEvents(data: SessionData): ReportEvent[] {
  const { meta, samples } = data;
  const events: ReportEvent[] = [
    { t: meta.startedAt, kind: "start", label: "Início da transmissão" },
  ];
  const prev: Record<string, string> = {};
  // Recuperação só faz sentido depois de uma QUEDA anunciada — sem isso, o primeiro
  // "live" após o setup gerava um "voltou" órfão.
  const droppedSince: Record<string, boolean> = {};
  let prevCpuHigh = false;

  for (const s of samples) {
    for (const t of s.targets) {
      // prev inicia no PRÓPRIO estado (não "live"): a partida conectando/tentando
      // não é transição — era daqui que saía o "reconectou" fantasma de toda live.
      const was = prev[t.id] ?? t.state;
      if (isProblemState(t.state) && was === "live") {
        droppedSince[t.id] = true;
        events.push({
          t: s.t,
          kind:
            t.state === "error"
              ? "error"
              : t.state === "signal-lost"
                ? "signal"
                : "reconnect",
          label: `${t.name} ${
            t.state === "error"
              ? "com erro"
              : t.state === "signal-lost"
                ? "ficou sem sinal do OBS"
                : "reconectou"
          }`,
        });
      } else if (
        t.state === "live" &&
        isProblemState(was) &&
        droppedSince[t.id]
      ) {
        droppedSince[t.id] = false;
        events.push({ t: s.t, kind: "recover", label: `${t.name} voltou` });
      }
      prev[t.id] = t.state;
    }
    const cpuHigh = s.cpu != null && s.cpu > CPU_HIGH;
    if (cpuHigh && !prevCpuHigh)
      events.push({
        t: s.t,
        kind: "cpu",
        label: `CPU em ${Math.round(s.cpu as number)}%`,
      });
    prevCpuHigh = cpuHigh;
  }

  if (meta.endedAt)
    events.push({ t: meta.endedAt, kind: "end", label: "Fim da transmissão" });
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
    (meta.platforms.find((p) => p.id === id)?.platformId ??
      "custom") as PlatformId;

  const byId: Record<
    string,
    {
      name: string;
      brs: number[];
      maxDropped: number;
      reconnects: number;
      prev: string;
    }
  > = {};
  for (const s of samples)
    for (const t of s.targets) {
      // prev inicia no próprio estado: o conectando/tentando da PARTIDA não conta
      // como reconexão (só transições live→problema são quedas de verdade).
      const e = (byId[t.id] ??= {
        name: t.name,
        brs: [],
        maxDropped: 0,
        reconnects: 0,
        prev: t.state,
      });
      if (t.state === "live") e.brs.push(t.bitrate);
      e.maxDropped = Math.max(e.maxDropped, t.dropped);
      if (isProblemState(t.state) && e.prev === "live") e.reconnects++;
      e.prev = t.state;
    }

  const perTarget = Object.entries(byId).map(([id, e]) => ({
    id,
    name: e.name,
    platformId: platOf(id),
    avgBitrate: e.brs.length
      ? Math.round(e.brs.reduce((a, b) => a + b, 0) / e.brs.length)
      : 0,
    minBitrate: e.brs.length ? minOf(e.brs) : 0,
    maxDropped: e.maxDropped,
    reconnects: e.reconnects,
  }));

  const avg = (a: number[]) =>
    a.length
      ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10
      : null;
  return {
    avgCpu: avg(cpus),
    maxCpu: cpus.length ? maxOf(cpus) : null,
    avgGpu: avg(gpus),
    maxGpu: gpus.length ? maxOf(gpus) : null,
    perTarget,
  };
}

function buildVerdict(windows: ProblemWindow[]): ReportAnalysis["verdict"] {
  if (!windows.length)
    return {
      tone: "ok",
      title: "Transmissão limpa",
      detail: "Nenhum perrengue detectado nessa live.",
    };
  const count = (k: ProblemWindow["causeKind"]) =>
    windows.filter((w) => w.causeKind === k).length;
  const enc = count("encoding");
  const render = count("render");
  const net = count("network");
  const plat = count("platform");
  const sig = count("signal");
  // Perrengue CURTO (≤30s somados, sem perda de sinal) não merece veredito vermelho:
  // o espectador quase certamente nem viu — o tom acompanha a experiência real.
  const totalBadSec = windows.reduce((a, w) => a + w.durationSec, 0);
  const brief = sig === 0 && totalBadSec <= 30;
  const briefNote = brief
    ? ` Foi coisa rápida (${totalBadSec}s no total) — a galera provavelmente nem percebeu.`
    : "";
  if (sig)
    return {
      tone: "bad",
      title: "O sinal do OBS caiu",
      detail: `${sig} trecho(s) sem vídeo chegando do OBS — a galera ficou vendo tela parada. Confere se o OBS ficou aberto, transmitindo e apontando pra Corneta.`,
    };
  if (enc)
    return {
      tone: brief ? "warn" : "bad",
      title: brief
        ? "Engasgo rápido de encoding"
        : "Seu PC não deu conta (encoding)",
      detail: `${enc} trecho(s) com CPU/GPU no talo.${briefNote} No OBS: Configurações → Saída → troque o Encoder pro da placa de vídeo (NVENC/QSV) — ou baixe o bitrate/resolução na tela Qualidade.`,
    };
  if (render)
    return {
      tone: "warn",
      title: "Cena pesada no OBS",
      detail: `${render} trecho(s) com o OBS penando pra montar o quadro (render lag) — alivie a cena (fontes/filtros/efeitos) ou baixe a resolução base no OBS.${briefNote}`,
    };
  if (net)
    return {
      tone: brief ? "warn" : "bad",
      title: brief
        ? "Engasgo rápido de internet"
        : "A internet não deu conta (upload)",
      detail: `${net} trecho(s) com bitrate caindo/reconexão sem o PC estar sobrecarregado.${briefNote} Se repetir, baixe o bitrate na tela Qualidade ou tire uma plataforma.`,
    };
  if (plat)
    return {
      tone: "warn",
      title: "Instabilidade de plataforma",
      detail: `${plat} trecho(s) afetando uma plataforma só — provavelmente o problema foi do lado dela, não seu.${briefNote}`,
    };
  return {
    tone: "warn",
    title: `${windows.length} trecho(s) com problema`,
    detail: "Veja os detalhes de cada um abaixo.",
  };
}

function viewerStats(d: SessionData): ViewerStats {
  const vs = d.viewerSamples;
  if (!vs.length)
    return {
      peak: 0,
      avg: 0,
      start: 0,
      end: 0,
      byPlatform: [],
      hasData: false,
    };
  const totals = vs.map((v) => v.total);
  const peakByKey: Record<
    string,
    { platform: ChatPlatform; source: string; peak: number }
  > = {};
  for (const v of vs)
    for (const it of v.items) {
      const k = `${it.platform}:${it.source}`;
      const cur = peakByKey[k] ?? {
        platform: it.platform,
        source: it.source,
        peak: 0,
      };
      cur.peak = Math.max(cur.peak, it.viewers ?? 0);
      peakByKey[k] = cur;
    }
  return {
    peak: maxOf(totals),
    avg: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
    start: totals[0],
    end: totals[totals.length - 1],
    byPlatform: Object.values(peakByKey).sort((a, b) => b.peak - a.peak),
    hasData: true,
  };
}

function chatStats(d: SessionData): ChatStats {
  const total = d.samples.reduce((a, s) => a + (s.chat ?? 0), 0);
  if (total === 0)
    return { total: 0, peakPerMin: 0, avgPerMin: 0, hasData: false };
  const rate = chatRateSeries(d).filter((x): x is number => x != null);
  const durMin = Math.max(1, d.meta.durationSec / 60);
  return {
    total,
    peakPerMin: rate.length ? maxOf(rate) : 0,
    avgPerMin: Math.round(total / durMin),
    hasData: true,
  };
}

function alertStats(d: SessionData): AlertStats {
  const a = d.alertEvents;
  const byKind: Record<string, number> = {};
  let bits = 0;
  let raids = 0;
  let raidViewers = 0;
  let topRaid: { user: string; amount: number } | undefined;
  for (const e of a) {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    if (e.kind === "bits") bits += e.amount ?? 0;
    if (e.kind === "raid") {
      raids++;
      raidViewers += e.amount ?? 0;
      if (!topRaid || (e.amount ?? 0) > topRaid.amount)
        topRaid = { user: e.user, amount: e.amount ?? 0 };
    }
  }
  const subs =
    (byKind.sub ?? 0) +
    (byKind.resub ?? 0) +
    (byKind.subgift ?? 0) +
    (byKind.member ?? 0);
  return {
    total: a.length,
    byKind,
    subs,
    bits,
    raids,
    raidViewers,
    topRaid,
    hasData: a.length > 0,
  };
}

/** Momentos de destaque (clipes sugeridos): picos de chat, alertas fortes e saltos de audiência. */
function highlights(d: SessionData): Highlight[] {
  const out: Highlight[] = [];
  const rate = chatRateSeries(d);
  const valid = rate.filter((x): x is number => x != null && x > 0);
  if (valid.length > 4) {
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    const thresh = Math.max(avg * 2.5, avg + 15);
    rate.forEach((r, i) => {
      if (r != null && r >= thresh)
        out.push({
          t: d.samples[i].t,
          kind: "chat",
          reason: `Chat explodiu (${r}/min)`,
          score: r,
        });
    });
  }
  for (const e of d.alertEvents) {
    const amt = e.amount ?? 0;
    if (e.kind === "raid" && amt >= 8)
      out.push({
        t: e.t,
        kind: "raid",
        reason: `Raid de ${e.user} (+${Math.round(amt)})`,
        score: 1000 + amt,
      });
    else if (e.kind === "subgift" && amt >= 5)
      out.push({
        t: e.t,
        kind: "alert",
        reason: `${e.user} presenteou ${Math.round(amt)} subs`,
        score: 500 + amt,
      });
    else if (e.kind === "superchat" && amt >= 20)
      out.push({
        t: e.t,
        kind: "alert",
        reason: `Super chat gordo de ${e.user}`,
        score: 400 + amt,
      });
    else if (e.kind === "bits" && amt >= 500)
      out.push({
        t: e.t,
        kind: "alert",
        reason: `${e.user}: ${Math.round(amt)} bits`,
        score: 300 + amt,
      });
  }
  const vs = d.viewerSamples;
  for (let i = 1; i < vs.length; i++) {
    const delta = vs[i].total - vs[i - 1].total;
    if (delta >= 15 && delta >= vs[i - 1].total * 0.2)
      out.push({
        t: vs[i].t,
        kind: "viewers",
        reason: `+${delta} assistindo de uma vez`,
        score: 150 + delta,
      });
  }
  out.sort((a, b) => b.score - a.score);
  const kept: Highlight[] = [];
  for (const h of out)
    if (!kept.some((k) => Math.abs(k.t - h.t) < 40_000)) kept.push(h);
  return kept.sort((a, b) => a.t - b.t).slice(0, 10);
}

export function analyze(data: SessionData): ReportAnalysis {
  const ctxs = targetCtxs(data.samples);
  const typical = typicalBitrates(data.samples, ctxs);
  const windows = problemWindows(data, typical, ctxs);
  return {
    events: deriveEvents(data),
    windows,
    verdict: buildVerdict(windows),
    ...aggregates(data),
    viewers: viewerStats(data),
    chat: chatStats(data),
    alerts: alertStats(data),
    highlights: highlights(data),
  };
}

// ---------------------------------------------------------------------------
// Mini-resumo por sessão (chips na lista + comparação com a live anterior)
// ---------------------------------------------------------------------------

/** Extrai o resumo de uma análise completa — zero duplicação de heurística. */
export function summarize(
  data: SessionData,
  a: ReportAnalysis,
): SessionSummary {
  return {
    hasData: data.samples.length > 1 || a.viewers.hasData,
    peakViewers: a.viewers.hasData ? a.viewers.peak : null,
    avgViewers: a.viewers.hasData ? a.viewers.avg : null,
    chatTotal: a.chat.hasData ? a.chat.total : null,
    problemWindows: a.windows.length,
    verdictTone: a.verdict.tone,
  };
}

// Cache do resumo em localStorage (adapter de I/O) — extraído pra summaryCache.ts e re-exportado
// aqui pra não mexer nos callers, deixando o report.ts 100% puro (só parse/análise).
export {
  getCachedSummary,
  setCachedSummary,
  dropCachedSummary,
} from "./summaryCache";
