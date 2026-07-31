// ============================================================
// Data, hora, número e duração no idioma ativo.
//
// Existe porque o app tinha 38 chamadas com "pt-BR" cravado. Espalhar o locale
// por cada chamada seria trocar 38 bugs por 38 oportunidades de esquecer um —
// aqui a fábrica recebe o idioma uma vez e devolve tudo já amarrado.
// ============================================================
import type { Locale } from "./locale";

export interface Fmt {
  /** Data curta com ano: `30/07/26` em pt-BR, `07/30/26` em inglês. */
  date: (ms: number) => string;
  /** Hora do relógio, sem segundos. */
  time: (ms: number) => string;
  /** Número com separador de milhar do idioma. */
  num: (v: number) => string;
  /** Número com casas decimais (bitrate em Mbps, carga em %). */
  dec: (v: number, digits?: number) => string;
  /** Bitrate com a unidade junto: `8,5 Mbps` / `8.5 Mbps`, `800 kbps`. */
  bitrate: (kbps: number) => string;
  /** Duração legível: `1h30` / `45min` em pt-BR, `1h30m` / `45m` em inglês. */
  dur: (seconds: number) => string;
  /** Ordenação de texto sensível ao idioma (acento no lugar certo). */
  compare: (a: string, b: string) => number;
}

/** Nome de arquivo NUNCA usa formato local: `2026-07-30` ordena sozinho no
 *  explorador e não colide entre anos. Fora da fábrica de propósito — não muda
 *  com o idioma, e não deveria. */
export function fileStamp(ms: number): string {
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function makeFmt(locale: Locale): Fmt {
  const collator = new Intl.Collator(locale);
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    // Sem isto, o inglês vira "8:15 PM" e quebra o alinhamento tabular das
    // colunas de horário do relatório.
    hour12: false,
  });

  const dec = (v: number, digits = 1) =>
    v.toLocaleString(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  return {
    date: (ms) => dateFmt.format(ms),
    time: (ms) => timeFmt.format(ms),
    num: (v) => v.toLocaleString(locale),
    dec,
    // "Mbps"/"kbps" são unidade técnica: iguais nos dois idiomas. O que muda é a
    // vírgula decimal — e era ela que estava cravada em pt-BR no fmtBitrate.
    bitrate: (kbps) =>
      kbps >= 1000 ? `${dec(kbps / 1000)} Mbps` : `${Math.round(kbps)} kbps`,
    dur: (seconds) => {
      const total = Math.round(seconds / 60);
      const h = Math.floor(total / 60);
      const m = total % 60;
      // O português já usava `1h30` (sem sufixo quando tem hora) e `45min`.
      // O inglês pede a unidade nos dois casos: `1h30m` e `45m`.
      const mm = String(m).padStart(2, "0");
      if (locale === "en") return h > 0 ? `${h}h${mm}m` : `${m}m`;
      return h > 0 ? `${h}h${mm}` : `${m}min`;
    },
    compare: (a, b) => collator.compare(a, b),
  };
}
