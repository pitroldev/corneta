// ============================================================
// Tira nomes de espectador e aplicativos locais do relatório antes de exportar.
//
// Enquanto o relatório fica na máquina, os nomes são só a memória da live. Exportado
// e mandado pro patrocinador/agência, viram dado pessoal de TERCEIRO saindo da mão de
// quem coletou — e o streamer não tem base pra isso. Daí a opção.
// ============================================================
import type { SessionData } from "../types";

/** Devolve uma cópia da sessão sem nomes de espectador.
 *
 *  `placeholder` é o que entra no lugar do nome. Quem chama passa a palavra do idioma
 *  em uso (`analysis.parse.alert.userFallback`: "alguém" / "someone") — assim o arquivo
 *  que vai pro patrocinador sai no mesmo idioma da tela, e a copy que promete a palavra
 *  entre aspas fala a verdade. Genérico de propósito: não é pseudônimo estável, porque
 *  pseudônimo estável ainda permite cruzar a mesma pessoa entre relatórios.
 *
 *  Age na FONTE, não na saída: a análise costura o nome dentro de textos prontos
 *  ("Raid de fulano (+90)"), e limpar depois viraria caça a substring. Anonimizando
 *  os eventos antes de `analyze`, tudo que deriva deles já nasce sem nome.
 *
 *  O que fica: nome de canal e de destino — são do próprio streamer, e sem eles o
 *  relatório perde justamente a leitura por plataforma. O ranking de aplicativos
 *  some inteiro: mesmo sendo local, ele pode revelar jogo, navegador ou ferramenta
 *  de trabalho para quem receber o arquivo. Mensagens de chat nunca estiveram aqui. */
export function anonymize(d: SessionData, placeholder: string): SessionData {
  return {
    ...d,
    samples: d.samples.map((sample) => ({ ...sample, apps: undefined })),
    alertEvents: d.alertEvents.map((e) => ({ ...e, user: placeholder })),
  };
}
