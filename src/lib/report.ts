// ============================================================
// Relatório pós-live: parse do NDJSON + análise (eventos, janelas
// problemáticas, veredito).
// ============================================================
import type { I18n, MessageKey } from "./i18n";
import { pluralSuffix } from "./i18n/locale";
import type {
  AlertKind,
  ChatPlatform,
  PlatformId,
  ReplayChatGap,
  ReplayChatMessage,
  SessionAlertEvent,
  SessionData,
  SessionFollowerSample,
  SessionMarker,
  SessionMeta,
  SessionRecording,
  SessionResourceApp,
  SessionSample,
  SessionSummary,
  SessionViewerSample,
} from "./types";

/** Tradução injetada. Este módulo é núcleo puro (nada de React aqui dentro), então
 *  quem chama passa o `t` do idioma ativo — nunca um estado global, que viraria
 *  corrida entre a janela principal e a do chat. */
export type Translate = I18n["t"];

type RawLine = { kind?: string; [k: string]: unknown };

const finiteMetric = (value: unknown, max = 100): number | undefined => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(max, number))
    : undefined;
};

/** O arquivo pode ter sido editado fora da Corneta. Revalida a fronteira de privacidade
 * também na leitura para nunca renderizar caminhos/títulos arbitrários como app. */
function parseResourceApps(value: unknown): SessionResourceApp[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const apps: SessionResourceApp[] = [];
  for (const raw of value.slice(0, 3)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const name = (
      String(item.name ?? "")
        .split(/[\\/]/)
        .pop() ?? ""
    )
      .replace(/[\p{Cc}]/gu, "")
      .trim()
      .slice(0, 64);
    if (!name) continue;
    const appRef = String(item.appRef ?? name)
      .toLocaleLowerCase("en-US")
      .replace(/[^\p{L}\p{N}._ -]/gu, "")
      .trim()
      .slice(0, 64);
    if (!appRef) continue;
    apps.push({
      appRef,
      name,
      cpu: finiteMetric(item.cpu) ?? 0,
      memoryMb: finiteMetric(item.memoryMb, 1024 * 1024) ?? 0,
      gpu3d: finiteMetric(item.gpu3d ?? item.gpu3D),
      gpuEncode: finiteMetric(item.gpuEncode),
    });
  }
  return apps.length ? apps : undefined;
}

/** Converte o NDJSON cru numa sessão estruturada. */
export function parseSession(ndjson: string, t: Translate): SessionData | null {
  const lines = ndjson
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let meta: SessionMeta | null = null;
  const samples: SessionSample[] = [];
  const markers: SessionMarker[] = [];
  const viewerSamples: SessionViewerSample[] = [];
  const followerSamples: SessionFollowerSample[] = [];
  const alertEvents: SessionAlertEvent[] = [];
  // Gravação: um segmento por vida do FFmpeg, indexado pelo número do segmento enquanto
  // as linhas chegam (`recording` abre, `recSync` reancora, `recEnd` fecha).
  const recs = new Map<number, SessionRecording>();
  const clockJumps: { t: number; delta: number }[] = [];
  let offsetMs = 0;
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
      const ts = Number(o.t);
      if (!Number.isFinite(ts)) continue;
      samples.push({
        t: ts,
        cpu: o.cpu == null ? undefined : Number(o.cpu),
        gpu: o.gpu == null ? undefined : Number(o.gpu),
        memoryPct: o.memoryPct == null ? undefined : finiteMetric(o.memoryPct),
        apps: parseResourceApps(o.apps),
        obs: o.obs == null ? undefined : (o.obs as SessionSample["obs"]),
        chat: o.chat == null ? undefined : Number(o.chat),
        chatBy:
          o.chatBy == null ? undefined : (o.chatBy as Record<string, number>),
        targets: (o.targets ?? []) as SessionSample["targets"],
      });
    } else if (o.kind === "viewers") {
      const ts = Number(o.t);
      if (!Number.isFinite(ts)) continue;
      viewerSamples.push({
        t: ts,
        total: Number(o.total) || 0,
        items: (o.items ?? []) as SessionViewerSample["items"],
      });
    } else if (o.kind === "followers") {
      const ts = Number(o.t);
      if (!Number.isFinite(ts)) continue;
      followerSamples.push({
        t: ts,
        items: (o.items ?? []) as SessionFollowerSample["items"],
      });
    } else if (o.kind === "alert") {
      const ts = Number(o.t);
      if (!Number.isFinite(ts)) continue;
      alertEvents.push({
        t: ts,
        platform: o.platform as ChatPlatform,
        source: o.source == null ? undefined : String(o.source),
        kind: o.alertKind as AlertKind,
        user: String(o.user ?? t("analysis.parse.alert.userFallback")),
        amount: o.amount == null ? undefined : Number(o.amount),
      });
    } else if (o.kind === "marker") {
      const ts = Number(o.t);
      if (Number.isFinite(ts))
        markers.push({
          t: ts,
          label: String(o.label ?? t("analysis.parse.marker.labelFallback")),
        });
    } else if (o.kind === "recording") {
      const ts = Number(o.t);
      const seg = Number(o.seg) || 1;
      if (!Number.isFinite(ts)) continue;
      recs.set(seg, {
        seg,
        t: ts,
        path: String(o.path ?? ""),
        codec: String(o.codec ?? "h264"),
        estimated: o.estimated === true,
        // A âncora inicial JÁ é a primeira sincronia: sem ela, um segmento sem `recSync`
        // (live curta) ficaria sem nenhuma referência.
        syncs: [{ t: ts, out: 0 }],
        endT: ts,
        finalized: false,
      });
    } else if (o.kind === "recSync") {
      const ts = Number(o.t);
      const out = Number(o.out);
      const r = recs.get(Number(o.seg) || 1);
      if (r && Number.isFinite(ts) && Number.isFinite(out)) {
        r.syncs.push({ t: ts, out });
        if (ts > r.endT) r.endT = ts;
      }
    } else if (o.kind === "recEnd") {
      const ts = Number(o.t);
      // `recEnd` sem `seg` vem da recuperação de boot (sessão truncada por queda de
      // energia): aplica no último segmento aberto, que é o que ficou pela metade.
      const seg =
        o.seg == null ? Math.max(...recs.keys(), 1) : Number(o.seg) || 1;
      const r = recs.get(seg);
      if (r) {
        if (Number.isFinite(ts) && ts > r.endT) r.endT = ts;
        r.reason = o.reason == null ? undefined : String(o.reason);
      }
    } else if (o.kind === "recFinalized") {
      const r = recs.get(Number(o.seg) || 1);
      if (r) r.finalized = true;
    } else if (o.kind === "clockJump") {
      const ts = Number(o.t);
      const delta = Number(o.delta);
      if (Number.isFinite(ts) && Number.isFinite(delta))
        clockJumps.push({ t: ts, delta });
    } else if (o.kind === "offset") {
      // Última linha vence: o NDJSON é append-only, então o ajuste manual é reescrito
      // em vez de editado. Grampeado porque o arquivo pode ter sido mexido na mão.
      const ms = Number(o.ms);
      if (Number.isFinite(ms))
        offsetMs = Math.max(-30_000, Math.min(30_000, ms));
    } else if (o.kind === "end") {
      const e = Number(o.endedAt);
      // `end` é terminal, mas relatórios podem receber anotações depois da live.
      // Versões antigas confundiam um marker posterior com sessão interrompida e
      // anexavam outro `end` no boot seguinte. O primeiro encerramento válido é o
      // real; o posterior é só essa recuperação equivocada.
      if (Number.isFinite(e))
        endedAt = endedAt == null ? e : Math.min(endedAt, e);
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
  // Segmento que nunca fechou (o app morreu antes do `recEnd`) fica com `endT === t` e
  // seria descartado como vazio. Fecha na última amostra: é o instante mais tardio que
  // sabemos ter existido, e é melhor um replay que termina cedo do que replay nenhum.
  for (const r of recs.values()) {
    if (r.endT <= r.t) r.endT = Math.max(endedAt ?? last, r.t);
  }

  return {
    meta,
    samples,
    markers,
    viewerSamples,
    followerSamples,
    alertEvents,
    recordings: [...recs.values()].sort((a, b) => a.t - b.t),
    clockJumps,
    offsetMs,
  };
}

/** Converte o `<id>.chat.ndjson` em mensagens + buracos.
 *
 *  As deleções são aplicadas NA LEITURA: quem foi moderado sai do replay por padrão, em
 *  vez de ficar guardado num campo que alguém esquece de filtrar depois. */
export function parseChatSession(ndjson: string): {
  messages: ReplayChatMessage[];
  gaps: ReplayChatGap[];
} {
  const messages: ReplayChatMessage[] = [];
  const gaps: ReplayChatGap[] = [];
  const deleted = new Set<string>();
  for (const line of ndjson.split("\n")) {
    const raw = line.trim();
    if (!raw) continue;
    let o: RawLine;
    try {
      o = JSON.parse(raw);
    } catch {
      continue;
    }
    const t = Number(o.t);
    if (!Number.isFinite(t)) continue;
    if (o.unavailable === true) return { messages: [], gaps: [] };
    if (o.del != null) {
      deleted.add(String(o.del));
    } else if (o.gap != null) {
      gaps.push({ t, from: Number(o.gap) || t });
    } else if (o.m != null) {
      messages.push({
        t,
        p: String(o.p ?? "twitch") as ReplayChatMessage["p"],
        s: String(o.s ?? ""),
        a: String(o.a ?? ""),
        c: o.c == null ? undefined : String(o.c),
        m: String(o.m),
        i: o.i == null ? undefined : String(o.i),
      });
    }
  }
  for (const m of messages) if (m.i && deleted.has(m.i)) m.deleted = true;
  messages.sort((a, b) => a.t - b.t);
  return { messages, gaps };
}

// ---------------------------------------------------------------------------
// Séries para os gráficos
// ---------------------------------------------------------------------------
export const timeAxis = (d: SessionData): number[] => d.samples.map((s) => s.t);
export const cpuSeries = (d: SessionData): (number | null)[] =>
  d.samples.map((s) => s.cpu ?? null);
export const gpuSeries = (d: SessionData): (number | null)[] =>
  d.samples.map((s) => s.gpu ?? null);
export const memorySeries = (d: SessionData): (number | null)[] =>
  d.samples.map((s) => s.memoryPct ?? null);
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

/** Audiência de UM canal ao longo do tempo (eixo = índice de `viewerSamples`). */
export function viewerSeriesFor(
  d: SessionData,
  key: string,
): (number | null)[] {
  return d.viewerSamples.map(
    (s) =>
      s.items.find((i) => channelKey(i.platform, i.source) === key)?.viewers ??
      null,
  );
}

/** Taxa de chat (msgs/min) de UM canal. Só faz sentido com `hasChatByChannel`. */
export function chatRateSeriesFor(
  d: SessionData,
  key: string,
): (number | null)[] {
  const s = d.samples;
  return s.map((x, i) => {
    // Sem o campo `chat` a amostra é anterior à contagem de chat: não é zero, é ausência.
    if (x.chat == null) return null;
    // Com `chat` mas sem `chatBy`, ninguém falou na janela — aí zero é a resposta certa.
    const c = x.chatBy?.[key] ?? 0;
    const dt = i > 0 ? (x.t - s[i - 1].t) / 1000 : 2;
    return dt > 0 ? Math.round((c * 60) / dt) : 0;
  });
}

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
    | "app"
    | "render"
    | "encoding"
    | "local"
    | "network"
    | "platform"
    | "signal"
    | "unknown";
  /** Nunca usamos "confirmada" para correlação: até a evidência mais forte é provável. */
  confidence: "high" | "medium" | "low";
  advice: string;
  targetName?: string;
  contributingApp?: string;
  /** Plataformas que sentiram, pelo nome — é a linha de impacto ("onde travou"). */
  affected: string[];
  totalTargets: number;
  /** Como o streamer confere, na próxima live, que a causa era essa mesmo. */
  confirm: string;
}

export interface ViewerStats {
  peak: number;
  avg: number;
  start: number;
  end: number;
  hasData: boolean;
}

/** Um canal do relatório: uma fonte de chat/audiência (`plataforma:rótulo`).
 *  Duas contas na mesma plataforma são DOIS canais — é o caso que motivou a feature. */
export interface ChannelStats {
  key: string;
  platform: ChatPlatform;
  /** Rótulo que o usuário deu à fonte (ou o próprio @/slug, se não nomeou). */
  source: string;
  viewers: { peak: number; avg: number; last: number; hasData: boolean };
  /** Fatia da audiência da live (0..100), ou null se a sessão não tem audiência. */
  sharePct: number | null;
  followers: {
    /** Seguidores ganhos na live. Pelo contador é LÍQUIDO: quem deixou de seguir
     *  subtrai, e o número pode ser negativo (a Twitch também faz limpeza de bots). */
    gained: number;
    /** Total do canal ao fim da live — só existe medido pelo contador. */
    total: number | null;
    /** `counter` = diferença do contador da plataforma (líquido, autoritativo).
     *  `alerts` = soma de eventos de follow (bruto). */
    from: "counter" | "alerts" | null;
    hasData: boolean;
  };
  chat: { total: number; perMin: number; hasData: boolean };
  alerts: {
    total: number;
    subs: number;
    bits: number;
    raids: number;
    follows: number;
    hasData: boolean;
  };
}

export interface ChannelBreakdown {
  channels: ChannelStats[];
  /** A sessão gravou chat por canal? Sessão antiga só tem o total da live. */
  hasChatByChannel: boolean;
  /** Alertas que não dá pra creditar a um canal (agregador, ou sessão antiga com
   *  duas fontes da mesma plataforma) — contados à parte em vez de chutados. */
  unattributedAlerts: number;
  /** Seguidores ganhos na live inteira. `null` = nenhuma fonte soube dizer. */
  followersGained: number | null;
  /** Algum canal foi medido pelo contador da plataforma — então o número é LÍQUIDO
   *  e a UI precisa dizer isso, senão não bate com o que o streamer contou de alertas. */
  followersNet: boolean;
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
  avgMemory: number | null;
  maxMemory: number | null;
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
  /** As mesmas métricas de público quebradas por canal. */
  byChannel: ChannelBreakdown;
  highlights: Highlight[];
}

const CPU_HIGH = 92;
const BITRATE_DROP = 0.6; // < 60% do típico = queda
const OBS_CONGEST = 0.3; // congestionamento de saída > 30%
const OBS_RENDER_MS = 25; // render lag do OBS acima disso = cena pesada
const APP_GPU_PRESSURE = 80;
const APP_CPU_PRESSURE = 70;
const MEMORY_PRESSURE = 92;
const APP_MEMORY_MB = 2048;
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
  previous?: SessionSample,
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
  // CPU/GPU no limite são CONTEXTO, não prova de uma live ruim. Um jogo pode ocupar
  // 99% da GPU por horas enquanto NVENC, OBS e os destinos seguem perfeitamente
  // saudáveis. Esses números ajudam a explicar um render lag real em `buildWindow`, mas
  // nunca abrem um incidente sozinhos.
  if (
    s.obs &&
    (s.obs.congestion > OBS_CONGEST || s.obs.avgRenderMs > OBS_RENDER_MS)
  )
    return true;
  // Contadores do OBS são cumulativos. Só o DELTA é problema; o valor absoluto
  // continuaria alto pelo resto da live e criaria uma janela infinita.
  if (
    counterRise(previous?.obs?.renderSkipped, s.obs?.renderSkipped) > 0 ||
    counterRise(previous?.obs?.outputSkipped, s.obs?.outputSkipped) > 0 ||
    targetDroppedIncrease([s], previous).total > 0
  )
    return true;
  return false;
}

const counterRise = (previous?: number, current?: number): number =>
  previous != null && current != null && current >= previous
    ? current - previous
    : 0;

function counterIncrease(
  samples: SessionSample[],
  previous: SessionSample | undefined,
  pick: (sample: SessionSample) => number | undefined,
): { total: number; firstAt?: number } {
  let before = previous ? pick(previous) : undefined;
  let total = 0;
  let firstAt: number | undefined;
  for (const sample of samples) {
    const current = pick(sample);
    const increase = counterRise(before, current);
    if (increase > 0 && firstAt == null) firstAt = sample.t;
    total += increase;
    before = current;
  }
  return { total, firstAt };
}

function targetDroppedIncrease(
  samples: SessionSample[],
  previous?: SessionSample,
): { total: number; firstAt?: number } {
  const before = new Map(
    previous?.targets.map((target) => [target.id, target.dropped]),
  );
  let total = 0;
  let firstAt: number | undefined;
  for (const sample of samples) {
    for (const target of sample.targets) {
      const increase = counterRise(before.get(target.id), target.dropped);
      if (increase > 0 && firstAt == null) firstAt = sample.t;
      total += increase;
      before.set(target.id, target.dropped);
    }
  }
  return { total, firstAt };
}

interface AppPressure {
  appRef: string;
  name: string;
  resource: "gpu" | "cpu" | "memory";
  value: number;
  /** Primeira amostra em que este app passou do limiar — é o que deixa dizer
   *  "3s depois, o OBS pulou quadros" em vez de só "os dois aconteceram". */
  firstAt: number;
}

/** Escolhe uma causa por aplicativo apenas quando o uso é realmente excepcional.
 * Aplicativo com 40% de GPU não ganha culpa só por estar no top 3. */
function dominantAppPressure(
  slice: SessionSample[],
  impactAt: number,
): AppPressure | undefined {
  const maxMemoryPct = Math.max(
    0,
    ...slice.map((sample) => sample.memoryPct ?? 0),
  );
  const candidates = new Map<string, AppPressure>();
  const record = (candidate: AppPressure) => {
    const key = `${candidate.appRef}\u0000${candidate.resource}`;
    const existing = candidates.get(key);
    if (!existing) {
      candidates.set(key, candidate);
      return;
    }
    existing.value = Math.max(existing.value, candidate.value);
    existing.firstAt = Math.min(existing.firstAt, candidate.firstAt);
  };
  for (const sample of slice) {
    // A lista de processos é esparsa (~6 s), portanto aceitamos uma pequena margem
    // em ambos os lados do efeito. Fora dela é só coexistência, não evidência causal.
    if (Math.abs(sample.t - impactAt) > 10_000) continue;
    for (const app of sample.apps ?? []) {
      if ((app.gpu3d ?? 0) >= APP_GPU_PRESSURE) {
        record({
          appRef: app.appRef,
          name: app.name,
          resource: "gpu",
          value: app.gpu3d ?? 0,
          firstAt: sample.t,
        });
      }
      if (app.cpu >= APP_CPU_PRESSURE) {
        record({
          appRef: app.appRef,
          name: app.name,
          resource: "cpu",
          value: app.cpu,
          firstAt: sample.t,
        });
      }
      if (maxMemoryPct >= MEMORY_PRESSURE && app.memoryMb >= APP_MEMORY_MB) {
        record({
          appRef: app.appRef,
          name: app.name,
          resource: "memory",
          value: app.memoryMb,
          firstAt: sample.t,
        });
      }
    }
  }
  return [...candidates.values()].sort((a, b) => {
    const normalized = (item: AppPressure) =>
      item.resource === "memory"
        ? Math.min(100, (item.value / 4096) * 100)
        : item.value;
    return normalized(b) - normalized(a);
  })[0];
}

interface WhyInput {
  causeKind: ProblemWindow["causeKind"];
  /** O aplicativo culpado (só quando a causa é `app`). */
  app?: AppPressure;
  /** OBS ou Corneta pesando — contexto, não culpa. */
  ownApp?: AppPressure;
  firstImpactAt?: number;
  renderSkipped: number;
  outputSkipped: number;
  renderLag: boolean;
  maxRenderMs: number;
  targetDropped: number;
  reconnect: boolean;
  bitrateDrop: boolean;
  affected: string[];
  totalTargets: number;
  maxCpu: number;
  maxGpu: number;
  maxMemoryPct: number;
  congestionPct: number;
}

/** "Por que eu acho isso" como HISTÓRIA, não como lista de contadores.
 *
 *  Três passos, nesta ordem: (1) quem puxou o quê, (2) o que travou por causa disso — com o
 *  atraso entre os dois, que é o que faz a correlação virar causa plausível — e (3) o que
 *  ficou de fora (internet e plataformas seguiram bem? só uma sentiu?). "O OBS não montou
 *  148 quadros" é sintoma; o streamer quer saber onde travou, o que causou e o que fazer.
 *  Cada passo só entra quando o dado existe; onde os dados não separam as hipóteses, o
 *  último passo diz isso em vez de fingir. */
function whyBullets(w: WhyInput, t: Translate): string[] {
  const pct = (v: number) => Math.round(v);
  const gb = (mb: number) => Math.max(0.1, Math.round((mb / 1024) * 10) / 10);
  const delay = () => {
    const at = w.app?.firstAt;
    if (at == null || w.firstImpactAt == null || w.firstImpactAt - at < 1500)
      return t("analysis.why.delay.same");
    return t("analysis.why.delay.after", {
      sec: Math.round((w.firstImpactAt - at) / 1000),
    });
  };
  // O mecanismo que travou. Com `withDelay`, encadeado à causa ("3s depois, …").
  const effect = (withDelay: boolean): string | undefined => {
    const k = withDelay ? "effect" : "mech";
    if (w.renderSkipped > 0)
      return t(`analysis.why.${k}.render` as MessageKey, {
        delay: delay(),
        count: Math.round(w.renderSkipped),
      });
    if (w.outputSkipped > 0)
      return t(`analysis.why.${k}.encode` as MessageKey, {
        delay: delay(),
        count: Math.round(w.outputSkipped),
      });
    if (w.renderLag)
      return t(`analysis.why.${k}.renderLag` as MessageKey, {
        delay: delay(),
        ms: pct(w.maxRenderMs),
      });
    if (w.targetDropped > 0)
      return t(`analysis.why.${k}.dropped` as MessageKey, {
        delay: delay(),
        count: Math.round(w.targetDropped),
      });
    return undefined;
  };
  // `pcSide`: a causa mora no PC, então queda de bitrate é CONSEQUÊNCIA (o encoder não
  // produziu) e não evidência de rede — só uma reconexão diz que a internet entrou.
  const scope = (pcSide: boolean) =>
    w.affected.length === 1 && w.totalTargets > 1
      ? t("analysis.why.scope.oneTarget", { target: w.affected[0] })
      : w.reconnect || (!pcSide && w.bitrateDrop)
        ? t("analysis.why.scope.allTargets")
        : t("analysis.why.scope.pcOnly");
  // A máquina como contexto quando nenhum app de fora leva a culpa.
  const machine = () => {
    if (w.ownApp) {
      const who = w.ownApp.appRef === "obs" ? "obs" : "corneta";
      const res = w.ownApp.resource === "gpu" ? "gpu" : "cpu";
      return t(`analysis.why.own.${who}.${res}` as MessageKey, {
        pct: pct(w.ownApp.value),
      });
    }
    if (w.maxGpu > CPU_HIGH)
      return t("analysis.why.machine.gpu", { pct: pct(w.maxGpu) });
    if (w.maxCpu > CPU_HIGH)
      return t("analysis.why.machine.cpu", { pct: pct(w.maxCpu) });
    if (w.maxMemoryPct >= MEMORY_PRESSURE)
      return t("analysis.why.machine.memory", { pct: pct(w.maxMemoryPct) });
    return t("analysis.why.machine.headroom");
  };

  const out: string[] = [];
  const push = (v: string | undefined) => {
    if (v) out.push(v);
  };
  const target = w.affected[0] ?? "";
  switch (w.causeKind) {
    case "app": {
      const a = w.app;
      if (!a) break;
      push(
        a.resource === "memory"
          ? t("analysis.why.app.memory", {
              app: a.name,
              gb: gb(a.value),
              pct: pct(w.maxMemoryPct),
            })
          : t(`analysis.why.app.${a.resource}` as MessageKey, {
              app: a.name,
              pct: pct(a.value),
            }),
      );
      push(effect(true));
      push(scope(true));
      break;
    }
    case "render":
    case "encoding":
      push(effect(false));
      push(machine());
      push(scope(true));
      break;
    case "local":
      push(t("analysis.why.local.congested", { pct: pct(w.congestionPct) }));
      push(t("analysis.why.local.beforeInternet"));
      break;
    case "network":
      push(
        w.reconnect
          ? t("analysis.why.network.reconnect", {
              targets: w.affected.join(", "),
            })
          : t("analysis.why.network.bitrate"),
      );
      push(t("analysis.why.network.pcFine"));
      push(t("analysis.why.network.limit"));
      break;
    case "platform":
      push(t("analysis.why.scope.oneTarget", { target }));
      push(t("analysis.why.network.pcFine"));
      push(t("analysis.why.platform.limit", { target }));
      break;
    case "signal":
      push(t("analysis.why.signal.stopped"));
      push(t("analysis.why.signal.blank"));
      break;
    default:
      break;
  }
  return out;
}

function buildWindow(
  slice: SessionSample[],
  sliceCtxs: Array<Record<string, TargetCtx>>,
  totalTargets: number,
  typical: Record<string, number>,
  t: Translate,
  previous?: SessionSample,
): ProblemWindow {
  const tStart = slice[0].t;
  const tEnd = slice[slice.length - 1].t;
  let maxCpu = 0;
  let maxGpu = 0;
  let maxCongestion = 0;
  let maxRenderMs = 0;
  let maxMemoryPct = 0;
  let reconnect = false;
  let bitrateDrop = false;
  let signalLost = false;
  const affected = new Set<string>();

  slice.forEach((s, i) => {
    if (s.cpu != null) maxCpu = Math.max(maxCpu, s.cpu);
    if (s.gpu != null) maxGpu = Math.max(maxGpu, s.gpu);
    if (s.memoryPct != null) maxMemoryPct = Math.max(maxMemoryPct, s.memoryPct);
    if (s.obs) {
      maxCongestion = Math.max(maxCongestion, s.obs.congestion);
      maxRenderMs = Math.max(maxRenderMs, s.obs.avgRenderMs);
    }
    // `tg` (não `t`): o `t` deste escopo é a tradução.
    for (const tg of s.targets) {
      const ctx = sliceCtxs[i][tg.id];
      const typ = typical[tg.id];
      if (tg.state === "signal-lost") {
        signalLost = true;
        affected.add(tg.name);
      } else if (
        (tg.state === "reconnecting" || tg.state === "error") &&
        ctx?.everLive
      ) {
        reconnect = true;
        affected.add(tg.name);
      }
      if (
        tg.state === "live" &&
        ctx?.warm &&
        typ &&
        tg.bitrate < typ * BITRATE_DROP
      ) {
        bitrateDrop = true;
        affected.add(tg.name);
      }
    }
  });

  const cpuHigh = maxCpu > CPU_HIGH;
  const gpuHigh = maxGpu > CPU_HIGH;
  const congested = maxCongestion > OBS_CONGEST;
  const renderLag = maxRenderMs > OBS_RENDER_MS;
  const singleTarget = affected.size === 1 && totalTargets > 1;
  const renderSkipped = counterIncrease(
    slice,
    previous,
    (sample) => sample.obs?.renderSkipped,
  );
  const outputSkipped = counterIncrease(
    slice,
    previous,
    (sample) => sample.obs?.outputSkipped,
  );
  const targetDropped = targetDroppedIncrease(slice, previous);
  const firstRenderLagAt = slice.find(
    (sample) => (sample.obs?.avgRenderMs ?? 0) > OBS_RENDER_MS,
  )?.t;
  const firstImpactAt = [
    renderSkipped.firstAt,
    outputSkipped.firstAt,
    targetDropped.firstAt,
    firstRenderLagAt,
  ]
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b)[0];
  const appPressure =
    firstImpactAt == null
      ? undefined
      : dominantAppPressure(
          previous ? [previous, ...slice] : slice,
          firstImpactAt,
        );
  const appCanExplain =
    appPressure != null &&
    appPressure.appRef !== "obs" &&
    appPressure.appRef !== "corneta" &&
    (renderSkipped.total > 0 ||
      outputSkipped.total > 0 ||
      renderLag ||
      targetDropped.total > 0);

  const rawSignals: string[] = [];
  if (signalLost) rawSignals.push(t("analysis.signal.obsSignalLost"));
  if (!signalLost && appCanExplain && appPressure?.resource === "gpu")
    rawSignals.push(
      t("analysis.signal.appGpu", {
        app: appPressure.name,
        pct: Math.round(appPressure.value),
      }),
    );
  if (!signalLost && appCanExplain && appPressure?.resource === "cpu")
    rawSignals.push(
      t("analysis.signal.appCpu", {
        app: appPressure.name,
        pct: Math.round(appPressure.value),
      }),
    );
  if (!signalLost && appCanExplain && appPressure?.resource === "memory")
    rawSignals.push(
      t("analysis.signal.appMemory", {
        app: appPressure.name,
        gb: Math.max(0.1, Math.round((appPressure.value / 1024) * 10) / 10),
      }),
    );
  if (renderSkipped.total > 0)
    rawSignals.push(
      t("analysis.signal.renderSkipped", {
        count: Math.round(renderSkipped.total),
      }),
    );
  if (outputSkipped.total > 0)
    rawSignals.push(
      t("analysis.signal.outputSkipped", {
        count: Math.round(outputSkipped.total),
      }),
    );
  if (targetDropped.total > 0)
    rawSignals.push(
      t("analysis.signal.targetDropped", {
        count: Math.round(targetDropped.total),
      }),
    );
  if (reconnect)
    rawSignals.push(
      t("analysis.signal.reconnected", { targets: [...affected].join(", ") }),
    );
  if (bitrateDrop) rawSignals.push(t("analysis.signal.bitrateDrop"));
  if (cpuHigh && !appCanExplain)
    rawSignals.push(t("analysis.signal.cpu", { pct: Math.round(maxCpu) }));
  if (gpuHigh && !appCanExplain)
    rawSignals.push(t("analysis.signal.gpu", { pct: Math.round(maxGpu) }));
  if (maxMemoryPct >= MEMORY_PRESSURE && !appCanExplain)
    rawSignals.push(
      t("analysis.signal.memory", { pct: Math.round(maxMemoryPct) }),
    );
  if (renderLag)
    rawSignals.push(
      t("analysis.signal.obsRender", { ms: Math.round(maxRenderMs) }),
    );
  if (congested)
    rawSignals.push(
      t("analysis.signal.obsCongested", {
        pct: Math.round(maxCongestion * 100),
      }),
    );

  // Copy de streamer: o que aconteceu, por que pensamos isso e o próximo passo.
  let cause = t("analysis.cause.unknown");
  let causeKind: ProblemWindow["causeKind"] = "unknown";
  let confidence: ProblemWindow["confidence"] = "low";
  let advice = t("analysis.advice.unknown");
  let confirm = t("analysis.confirm.unknown");
  let contributingApp: string | undefined;
  if (signalLost) {
    cause = t("analysis.cause.signal");
    causeKind = "signal";
    confidence = "high";
    advice = t("analysis.advice.signal");
    confirm = t("analysis.confirm.signal");
  } else if (appCanExplain && appPressure) {
    cause = t(`analysis.cause.app.${appPressure.resource}` as MessageKey, {
      app: appPressure.name,
    });
    causeKind = "app";
    confidence =
      renderSkipped.total > 0 || outputSkipped.total > 0 ? "high" : "medium";
    advice = t(`analysis.advice.app.${appPressure.resource}` as MessageKey, {
      app: appPressure.name,
    });
    contributingApp = appPressure.name;
    confirm = t(`analysis.confirm.app.${appPressure.resource}` as MessageKey, {
      app: appPressure.name,
    });
  } else if (renderSkipped.total > 0) {
    cause = t("analysis.cause.render");
    causeKind = "render";
    confidence = "high";
    advice = t("analysis.advice.render");
    confirm = t("analysis.confirm.render");
  } else if (outputSkipped.total > 0) {
    cause = t("analysis.cause.encoding");
    causeKind = "encoding";
    confidence = "high";
    advice = t("analysis.advice.encoding");
    confirm = t("analysis.confirm.encoding");
  } else if (renderLag) {
    if (cpuHigh || gpuHigh || maxMemoryPct >= MEMORY_PRESSURE) {
      cause = t("analysis.cause.encoding");
      causeKind = "encoding";
      confidence = "medium";
      advice = t("analysis.advice.encoding");
      confirm = t("analysis.confirm.encoding");
    } else {
      cause = t("analysis.cause.render");
      causeKind = "render";
      confidence = "medium";
      advice = t("analysis.advice.render");
      confirm = t("analysis.confirm.render");
    }
  } else if (congested) {
    cause = t("analysis.cause.local");
    causeKind = "local";
    confidence = "medium";
    advice = t("analysis.advice.local");
    confirm = t("analysis.confirm.local");
  } else if ((bitrateDrop || reconnect) && !singleTarget) {
    cause = t("analysis.cause.network");
    causeKind = "network";
    confidence = "low";
    advice = t("analysis.advice.network");
    confirm = t("analysis.confirm.network");
  } else if (singleTarget) {
    cause = t("analysis.cause.platform", { target: [...affected][0] });
    causeKind = "platform";
    confidence = "low";
    advice = t("analysis.advice.platform");
    confirm = t("analysis.confirm.platform", { target: [...affected][0] });
  }

  // Pressão de um processo NOSSO (OBS/Corneta) não vira "causa" — mas explica o trecho.
  const ownApp =
    appPressure &&
    !appCanExplain &&
    (appPressure.appRef === "obs" || appPressure.appRef === "corneta") &&
    appPressure.resource !== "memory"
      ? appPressure
      : undefined;
  const signals =
    causeKind === "unknown"
      ? rawSignals
      : whyBullets(
          {
            causeKind,
            app: appCanExplain ? appPressure : undefined,
            ownApp,
            firstImpactAt,
            renderSkipped: renderSkipped.total,
            outputSkipped: outputSkipped.total,
            renderLag,
            maxRenderMs,
            targetDropped: targetDropped.total,
            reconnect,
            bitrateDrop,
            affected: [...affected],
            totalTargets,
            maxCpu,
            maxGpu,
            maxMemoryPct,
            congestionPct: maxCongestion * 100,
          },
          t,
        );

  return {
    tStart,
    tEnd,
    durationSec: Math.max(1, Math.round((tEnd - tStart) / 1000)),
    signals,
    cause,
    causeKind,
    confidence,
    advice,
    targetName: affected.size === 1 ? [...affected][0] : undefined,
    contributingApp,
    affected: [...affected],
    totalTargets,
    confirm,
  };
}

function problemWindows(
  data: SessionData,
  typical: Record<string, number>,
  ctxs: Array<Record<string, TargetCtx>>,
  t: Translate,
): ProblemWindow[] {
  const { samples } = data;
  const flags = samples.map((s, i) =>
    isBad(s, typical, ctxs[i], samples[i - 1]),
  );

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
      // (bitrate/congestion/render) só vira incidente se PERSISTIR — um blip
      // de 2s pintava o veredito de vermelho sem espectador ter visto nada.
      const hard = samples
        .slice(a, b + 1)
        .some((s, i) =>
          s.targets.some(
            (tg) => isProblemState(tg.state) && ctxs[a + i][tg.id]?.everLive,
          ),
        );
      const before = samples[a - 1];
      const windowSamples = samples.slice(a, b + 1);
      const severeFrameLoss =
        counterIncrease(
          windowSamples,
          before,
          (sample) => sample.obs?.renderSkipped,
        ).total >= 30 ||
        counterIncrease(
          windowSamples,
          before,
          (sample) => sample.obs?.outputSkipped,
        ).total >= 30 ||
        targetDroppedIncrease(windowSamples, before).total >= 30;
      return (
        hard ||
        severeFrameLoss ||
        samples[b].t - samples[a].t >= SOFT_WINDOW_MIN_MS
      );
    })
    .map(([a, b]) =>
      buildWindow(
        samples.slice(a, b + 1),
        ctxs.slice(a, b + 1),
        totalTargets,
        typical,
        t,
        samples[a - 1],
      ),
    );
}

function deriveEvents(data: SessionData, t: Translate): ReportEvent[] {
  const { meta, samples } = data;
  const events: ReportEvent[] = [
    { t: meta.startedAt, kind: "start", label: t("analysis.event.start") },
  ];
  const prev: Record<string, string> = {};
  // Recuperação só faz sentido depois de uma QUEDA anunciada — sem isso, o primeiro
  // "live" após o setup gerava um "voltou" órfão.
  const droppedSince: Record<string, boolean> = {};
  let prevCpuHigh = false;

  for (const s of samples) {
    // `tg` (não `t`): o `t` deste escopo é a tradução.
    for (const tg of s.targets) {
      // prev inicia no PRÓPRIO estado (não "live"): a partida conectando/tentando
      // não é transição — era daqui que saía o "reconectou" fantasma de toda live.
      const was = prev[tg.id] ?? tg.state;
      if (isProblemState(tg.state) && was === "live") {
        droppedSince[tg.id] = true;
        events.push({
          t: s.t,
          kind:
            tg.state === "error"
              ? "error"
              : tg.state === "signal-lost"
                ? "signal"
                : "reconnect",
          label: t(
            tg.state === "error"
              ? "analysis.event.error"
              : tg.state === "signal-lost"
                ? "analysis.event.signalLost"
                : "analysis.event.reconnect",
            { target: tg.name },
          ),
        });
      } else if (
        tg.state === "live" &&
        isProblemState(was) &&
        droppedSince[tg.id]
      ) {
        droppedSince[tg.id] = false;
        events.push({
          t: s.t,
          kind: "recover",
          label: t("analysis.event.recover", { target: tg.name }),
        });
      }
      prev[tg.id] = tg.state;
    }
    const cpuHigh = s.cpu != null && s.cpu > CPU_HIGH;
    if (cpuHigh && !prevCpuHigh)
      events.push({
        t: s.t,
        kind: "cpu",
        label: t("analysis.event.cpuHigh", {
          pct: Math.round(s.cpu as number),
        }),
      });
    prevCpuHigh = cpuHigh;
  }

  if (meta.endedAt)
    events.push({
      t: meta.endedAt,
      kind: "end",
      label: t("analysis.event.end"),
    });
  for (const m of data.markers) {
    events.push({
      t: m.t,
      kind: "marker",
      label: t("analysis.event.marker", { label: m.label }),
    });
  }
  events.sort((a, b) => a.t - b.t);
  return events;
}

function aggregates(data: SessionData) {
  const { meta, samples } = data;
  const cpus = samples.map((s) => s.cpu).filter((x): x is number => x != null);
  const gpus = samples.map((s) => s.gpu).filter((x): x is number => x != null);
  const memories = samples
    .map((s) => s.memoryPct)
    .filter((x): x is number => x != null);
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
    avgMemory: avg(memories),
    maxMemory: memories.length ? maxOf(memories) : null,
    perTarget,
  };
}

function buildVerdict(
  windows: ProblemWindow[],
  t: Translate,
): ReportAnalysis["verdict"] {
  if (!windows.length)
    return {
      tone: "ok",
      title: t("analysis.verdict.clean.title"),
      detail: t("analysis.verdict.clean.detail"),
    };
  const count = (k: ProblemWindow["causeKind"]) =>
    windows.filter((w) => w.causeKind === k).length;
  const appWindows = windows.filter((window) => window.causeKind === "app");
  const apps = new Map<
    string,
    { name: string; count: number; totalSec: number; firstAt: number }
  >();
  for (const window of appWindows) {
    const name = window.contributingApp ?? window.cause;
    const current = apps.get(name);
    if (current) {
      current.count += 1;
      current.totalSec += window.durationSec;
    } else {
      apps.set(name, {
        name,
        count: 1,
        totalSec: window.durationSec,
        firstAt: window.tStart,
      });
    }
  }
  const dominantApp = [...apps.values()].sort(
    (left, right) =>
      right.totalSec - left.totalSec ||
      right.count - left.count ||
      left.firstAt - right.firstAt,
  )[0];
  const enc = count("encoding");
  const render = count("render");
  const local = count("local");
  const net = count("network");
  const plat = count("platform");
  const sig = count("signal");
  // Perrengue CURTO (≤30s somados, sem perda de sinal) não merece veredito vermelho:
  // o espectador quase certamente nem viu — o tom acompanha a experiência real.
  const totalBadSec = windows.reduce((a, w) => a + w.durationSec, 0);
  const brief = sig === 0 && totalBadSec <= 30;
  const durationFor = (kind: ProblemWindow["causeKind"]) =>
    windows
      .filter((window) => window.causeKind === kind)
      .reduce((total, window) => total + window.durationSec, 0);
  const briefNoteFor = (durationSec: number) =>
    brief ? t("analysis.verdict.brief", { sec: durationSec }) : "";
  // O substantivo entra por buraco em vez de virar "trecho(s)": remendo com
  // parêntese é o tipo de coisa que só passa despercebida em português.
  // `analyze` recebe só o `t`, então a variante sai da mesma regra do `tp`.
  const stretch = (n: number) =>
    t(`analysis.verdict.stretch.${pluralSuffix(n)}` as MessageKey);
  const patch = (n: number) =>
    t(`analysis.verdict.patch.${pluralSuffix(n)}` as MessageKey);
  if (sig)
    return {
      tone: "bad",
      title: t("analysis.verdict.signal.title"),
      detail: t("analysis.verdict.signal.detail", {
        n: sig,
        stretch: stretch(sig),
      }),
    };
  if (dominantApp) {
    return {
      tone: brief ? "warn" : "bad",
      title: t("analysis.verdict.app.title", { app: dominantApp.name }),
      detail: t("analysis.verdict.app.detail", {
        n: dominantApp.count,
        app: dominantApp.name,
        stretch: stretch(dominantApp.count),
        brief: briefNoteFor(dominantApp.totalSec),
      }),
    };
  }
  if (enc)
    return {
      tone: brief ? "warn" : "bad",
      title: t(
        brief
          ? "analysis.verdict.encoding.title.brief"
          : "analysis.verdict.encoding.title",
      ),
      detail: t("analysis.verdict.encoding.detail", {
        n: enc,
        stretch: stretch(enc),
        brief: briefNoteFor(durationFor("encoding")),
      }),
    };
  if (render)
    return {
      tone: "warn",
      title: t("analysis.verdict.render.title"),
      detail: t("analysis.verdict.render.detail", {
        n: render,
        stretch: stretch(render),
        brief: briefNoteFor(durationFor("render")),
      }),
    };
  if (local)
    return {
      tone: brief ? "warn" : "bad",
      title: t("analysis.verdict.local.title"),
      detail: t("analysis.verdict.local.detail", {
        n: local,
        stretch: stretch(local),
        brief: briefNoteFor(durationFor("local")),
      }),
    };
  if (net)
    return {
      tone: brief ? "warn" : "bad",
      title: t(
        brief
          ? "analysis.verdict.network.title.brief"
          : "analysis.verdict.network.title",
      ),
      detail: t("analysis.verdict.network.detail", {
        n: net,
        stretch: stretch(net),
        brief: briefNoteFor(durationFor("network")),
      }),
    };
  if (plat)
    return {
      tone: "warn",
      title: t("analysis.verdict.platform.title"),
      detail: t("analysis.verdict.platform.detail", {
        n: plat,
        stretch: stretch(plat),
        brief: briefNoteFor(durationFor("platform")),
      }),
    };
  return {
    tone: "warn",
    title: t("analysis.verdict.windows.title", {
      n: windows.length,
      patch: patch(windows.length),
    }),
    detail: t("analysis.verdict.windows.detail"),
  };
}

function viewerStats(d: SessionData): ViewerStats {
  const vs = d.viewerSamples;
  if (!vs.length) return { peak: 0, avg: 0, start: 0, end: 0, hasData: false };
  const totals = vs.map((v) => v.total);
  return {
    peak: maxOf(totals),
    avg: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
    start: totals[0],
    end: totals[totals.length - 1],
    hasData: true,
  };
}

// ---------------------------------------------------------------------------
// Por canal — a mesma live vista de cada plataforma/conta
// ---------------------------------------------------------------------------

/** Chave estável de um canal. `source` é o rótulo que o usuário deu à fonte. */
export const channelKey = (platform: string, source: string) =>
  `${platform}:${source}`;

const CHAT_PLATFORMS = ["twitch", "youtube", "kick", "cinefy"] as const;
const isChatPlatform = (p: string): p is ChatPlatform =>
  (CHAT_PLATFORMS as readonly string[]).includes(p);

interface ChannelAcc {
  platform: ChatPlatform;
  source: string;
  viewerSum: number;
  viewerPeak: number;
  viewerLast: number;
  viewerSeen: boolean;
  chat: number;
  /** Primeiro e último total de seguidores visto — a diferença é o ganho da live.
   *  `followCount` existe porque UM ponto não é uma diferença: primeiro e último
   *  seriam o mesmo valor e o ganho sairia como zero medido, que é mentira. */
  followFirst: number | null;
  followLast: number | null;
  followCount: number;
  alerts: {
    total: number;
    subs: number;
    bits: number;
    raids: number;
    follows: number;
  };
}

function newAcc(platform: ChatPlatform, source: string): ChannelAcc {
  return {
    platform,
    source,
    viewerSum: 0,
    viewerPeak: 0,
    viewerLast: 0,
    viewerSeen: false,
    chat: 0,
    followFirst: null,
    followLast: null,
    followCount: 0,
    alerts: { total: 0, subs: 0, bits: 0, raids: 0, follows: 0 },
  };
}

const SUB_KINDS: AlertKind[] = ["sub", "resub", "subgift", "member"];

function channelBreakdown(d: SessionData): ChannelBreakdown {
  const acc = new Map<string, ChannelAcc>();
  const get = (platform: ChatPlatform, source: string) => {
    const k = channelKey(platform, source);
    let c = acc.get(k);
    if (!c) acc.set(k, (c = newAcc(platform, source)));
    return c;
  };

  // --- Audiência ---
  for (const v of d.viewerSamples)
    for (const it of v.items) {
      const c = get(it.platform, it.source);
      if (it.viewers == null) continue;
      // Canal FORA do ar entra como zero na soma (não é ignorado): só assim a soma das
      // médias dos canais bate com a média total e as fatias fecham em 100%.
      c.viewerSum += it.viewers;
      c.viewerPeak = Math.max(c.viewerPeak, it.viewers);
      c.viewerLast = it.viewers;
      c.viewerSeen = true;
    }
  const vN = d.viewerSamples.length;

  // --- Seguidores (contador da plataforma) ---
  for (const f of d.followerSamples)
    for (const it of f.items) {
      const c = get(it.platform, it.source);
      if (!Number.isFinite(it.total)) continue;
      if (c.followFirst == null) c.followFirst = it.total;
      c.followLast = it.total;
      c.followCount++;
    }

  // --- Chat ---
  let hasChatByChannel = false;
  for (const s of d.samples) {
    if (!s.chatBy) continue;
    hasChatByChannel = true;
    for (const [k, n] of Object.entries(s.chatBy)) {
      // A chave já vem como `plataforma:fonte`; um split ingênuo quebraria um rótulo
      // que contenha ":" — daí o corte no PRIMEIRO separador só.
      const i = k.indexOf(":");
      if (i <= 0) continue;
      const platform = k.slice(0, i);
      if (!isChatPlatform(platform)) continue;
      get(platform, k.slice(i + 1)).chat += n;
    }
  }

  // --- Alertas ---
  // Depois dos outros de propósito: o fallback de sessão antiga (alerta sem `source`)
  // precisa saber quantos canais aquela plataforma tem.
  const perPlatform = new Map<string, string[]>();
  for (const c of acc.values()) {
    const list = perPlatform.get(c.platform) ?? [];
    list.push(c.source);
    perPlatform.set(c.platform, list);
  }
  let unattributedAlerts = 0;
  for (const e of d.alertEvents) {
    // Alerta de agregador (Streamlabs/StreamElements) traz o nome do agregador em
    // `platform` — não dá pra dizer de qual canal veio.
    if (!isChatPlatform(e.platform)) {
      unattributedAlerts++;
      continue;
    }
    let source = e.source;
    if (source == null) {
      // Sessão gravada antes do `source`. Com um canal só na plataforma, a atribuição é
      // certa; com dois, qualquer palpite estaria errado metade das vezes.
      const known = perPlatform.get(e.platform) ?? [];
      if (known.length !== 1) {
        unattributedAlerts++;
        continue;
      }
      source = known[0];
    }
    const a = get(e.platform, source).alerts;
    a.total++;
    if (SUB_KINDS.includes(e.kind)) a.subs++;
    if (e.kind === "bits") a.bits += e.amount ?? 0;
    if (e.kind === "raid") a.raids++;
    if (e.kind === "follow") a.follows++;
  }

  const totalViewerSum = [...acc.values()].reduce((a, c) => a + c.viewerSum, 0);
  const durMin = Math.max(1, d.meta.durationSec / 60);

  const channels: ChannelStats[] = [...acc.entries()].map(([key, c]) => ({
    key,
    platform: c.platform,
    source: c.source,
    viewers: {
      peak: c.viewerPeak,
      avg: vN ? Math.round(c.viewerSum / vN) : 0,
      last: c.viewerLast,
      hasData: c.viewerSeen,
    },
    sharePct: totalViewerSum
      ? Math.round((c.viewerSum / totalViewerSum) * 1000) / 10
      : null,
    chat: {
      total: c.chat,
      perMin: Math.round(c.chat / durMin),
      hasData: hasChatByChannel,
    },
    followers: channelFollowers(c),
    alerts: { ...c.alerts, hasData: c.alerts.total > 0 },
  }));

  // Maior audiência primeiro; sem audiência, quem teve mais chat. O nome desempata pra
  // ordem não dançar entre duas aberturas do mesmo relatório.
  channels.sort(
    (a, b) =>
      b.viewers.avg - a.viewers.avg ||
      b.chat.total - a.chat.total ||
      a.source.localeCompare(b.source, "pt-BR"),
  );
  return {
    channels,
    hasChatByChannel,
    unattributedAlerts,
    ...followersRollup(channels, d.alertEvents),
  };
}

/** Seguidores de UM canal: o contador da plataforma ganha dos alertas quando existe. */
function channelFollowers(c: ChannelAcc): ChannelStats["followers"] {
  // Uma amostra só (live curta demais, ou o contador só respondeu no fim) não permite
  // diferença nenhuma — o total é conhecido, o ganho não.
  if (c.followCount >= 2 && c.followFirst != null && c.followLast != null)
    return {
      gained: c.followLast - c.followFirst,
      total: c.followLast,
      from: "counter",
      hasData: true,
    };
  if (c.alerts.follows > 0)
    return {
      gained: c.alerts.follows,
      total: c.followLast,
      from: "alerts",
      hasData: true,
    };
  return { gained: 0, total: c.followLast, from: null, hasData: false };
}

/** Total da live, sem contar o mesmo seguidor duas vezes.
 *
 *  O conflito é real: quem tem Streamlabs ligado na Twitch recebe o evento de follow
 *  E tem o contador da Twitch medindo a mesma pessoa. Somar os dois dobraria o número.
 *  A regra é: quando ALGUM canal foi medido por contador, os follows de agregador
 *  (que não pertencem a canal nenhum) são descartados como duplicata — o contador da
 *  plataforma é a fonte mais confiável que existe pra isso. */
function followersRollup(
  channels: ChannelStats[],
  alerts: SessionAlertEvent[],
): Pick<ChannelBreakdown, "followersGained" | "followersNet"> {
  const withData = channels.filter((c) => c.followers.hasData);
  const net = withData.some((c) => c.followers.from === "counter");
  const orphanFollows = net
    ? 0
    : alerts.filter((e) => e.kind === "follow" && !isChatPlatform(e.platform))
        .length;
  if (!withData.length && !orphanFollows)
    return { followersGained: null, followersNet: false };
  return {
    followersGained:
      withData.reduce((s, c) => s + c.followers.gained, 0) + orphanFollows,
    followersNet: net,
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
function highlights(d: SessionData, t: Translate): Highlight[] {
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
          reason: t("analysis.highlight.chatSpike", { rate: r }),
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
        reason: t("analysis.highlight.raid", {
          user: e.user,
          n: Math.round(amt),
        }),
        score: 1000 + amt,
      });
    else if (e.kind === "subgift" && amt >= 5)
      out.push({
        t: e.t,
        kind: "alert",
        reason: t("analysis.highlight.subgift", {
          user: e.user,
          n: Math.round(amt),
        }),
        score: 500 + amt,
      });
    else if (e.kind === "superchat" && amt >= 20)
      out.push({
        t: e.t,
        kind: "alert",
        reason: t("analysis.highlight.superchat", { user: e.user }),
        score: 400 + amt,
      });
    else if (e.kind === "bits" && amt >= 500)
      out.push({
        t: e.t,
        kind: "alert",
        reason: t("analysis.highlight.bits", {
          user: e.user,
          n: Math.round(amt),
        }),
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
        reason: t("analysis.highlight.viewerJump", { delta }),
        score: 150 + delta,
      });
  }
  out.sort((a, b) => b.score - a.score);
  const kept: Highlight[] = [];
  for (const h of out)
    if (!kept.some((k) => Math.abs(k.t - h.t) < 40_000)) kept.push(h);
  return kept.sort((a, b) => a.t - b.t).slice(0, 10);
}

export function analyze(data: SessionData, t: Translate): ReportAnalysis {
  const ctxs = targetCtxs(data.samples);
  const typical = typicalBitrates(data.samples, ctxs);
  const windows = problemWindows(data, typical, ctxs, t);
  return {
    events: deriveEvents(data, t),
    windows,
    verdict: buildVerdict(windows, t),
    ...aggregates(data),
    viewers: viewerStats(data),
    chat: chatStats(data),
    alerts: alertStats(data),
    byChannel: channelBreakdown(data),
    highlights: highlights(data, t),
  };
}

// ---------------------------------------------------------------------------
// Mini-resumo por sessão (chips na lista + comparação com a live anterior)
// ---------------------------------------------------------------------------

/** Marcadores alteram a linha do tempo, não os diagnósticos de recursos. */
export function withReportMarkers(
  analysis: ReportAnalysis,
  markers: readonly SessionMarker[],
  t: Translate,
): ReportAnalysis {
  const events = analysis.events.filter((event) => event.kind !== "marker");
  for (const marker of markers)
    events.push({
      t: marker.t,
      kind: "marker",
      label: t("analysis.event.marker", { label: marker.label }),
    });
  events.sort((a, b) => a.t - b.t);
  return { ...analysis, events };
}

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
