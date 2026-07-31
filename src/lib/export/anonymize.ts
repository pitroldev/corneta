// ============================================================
// Tira nomes de espectador do relatório antes de exportar.
//
// Enquanto o relatório fica na máquina, os nomes são só a memória da live. Exportado
// e mandado pro patrocinador/agência, viram dado pessoal de TERCEIRO saindo da mão de
// quem coletou — e o streamer não tem base pra isso. Daí a opção.
// ============================================================
import type { SessionData } from "../types";

/** O que substitui o nome. Genérico de propósito: não é pseudônimo estável, porque
 *  pseudônimo estável ainda permite cruzar a mesma pessoa entre relatórios. */
const ANON = "alguém";

/** Devolve uma cópia da sessão sem nomes de espectador.
 *
 *  Age na FONTE, não na saída: a análise costura o nome dentro de textos prontos
 *  ("Raid de fulano (+90)"), e limpar depois viraria caça a substring. Anonimizando
 *  os eventos antes de `analyze`, tudo que deriva deles já nasce sem nome.
 *
 *  O que fica: nome de canal e de destino — são do próprio streamer, e sem eles o
 *  relatório perde justamente a leitura por plataforma. Mensagens de chat nunca
 *  estiveram aqui (a sessão guarda só a contagem). */
export function anonymize(d: SessionData): SessionData {
  return {
    ...d,
    alertEvents: d.alertEvents.map((e) => ({ ...e, user: ANON })),
  };
}
