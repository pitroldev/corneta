import type { SessionData } from "../types";
import type { ReportAnalysis } from "../report";

/** Increment when an existing field changes meaning, not for additive fields. */
export const REPORT_JSON_VERSION = 1;

// Version 1 field names are a public export contract; preserve their spelling.
export function reportJson(d: SessionData, a: ReportAnalysis): string {
  return JSON.stringify(
    {
      formato: "corneta.relatorio",
      versao: REPORT_JSON_VERSION,
      live: {
        id: d.meta.id,
        inicio: new Date(d.meta.startedAt).toISOString(),
        fim: d.meta.endedAt ? new Date(d.meta.endedAt).toISOString() : null,
        duracaoSeg: d.meta.durationSec,
        modo: d.meta.mode,
        plataformas: d.meta.platforms,
      },
      veredito: a.verdict,
      audiencia: a.viewers,
      chat: a.chat,
      alertas: a.alerts,
      porCanal: a.byChannel,
      porDestino: a.perTarget,
      maquina: {
        cpuMedia: a.avgCpu,
        cpuMax: a.maxCpu,
        gpuMedia: a.avgGpu,
        gpuMax: a.maxGpu,
        memoriaMedia: a.avgMemory,
        memoriaMax: a.maxMemory,
      },
      trechosComProblema: a.windows,
      momentos: a.highlights,
      eventos: a.events.map((e) => ({
        instante: new Date(e.t).toISOString(),
        segundosDoInicio: Math.round((e.t - d.meta.startedAt) / 1000),
        tipo: e.kind,
        descricao: e.label,
      })),
      amostras: {
        maquina: d.samples.length,
        audiencia: d.viewerSamples.length,
        seguidores: d.followerSamples.length,
      },
    },
    null,
    2,
  );
}
