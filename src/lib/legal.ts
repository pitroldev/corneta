// Documentos legais: onde eles moram e o registro de que o usuário os viu.
//
// Duplica de propósito o mínimo de `web/lib/legal.ts`. App e site são workspaces
// separados, sem build compartilhado — aqui fica só o que o app precisa ABRIR. O
// texto dos documentos continua publicado num lugar só, pelo site.
//
// POR QUE O ACEITE NÃO VAI PRA `AppConfig.settings`: a config é exportável e
// importável (`export_config`/`import_config` em commands.rs). Aceite que viaja
// num JSON entre máquinas é aceite de outra pessoa — importar a config de um
// amigo marcaria como aceito algo que este usuário nunca viu, que é exatamente
// o contrário do que o registro serve pra provar. O aceite é da INSTALAÇÃO, não
// da configuração, então mora no storage local e não sai daqui.
//
// E não vai pro servidor de propósito: guardar quem aceitou o quê exigiria criar
// identidade e persistir dado de usuário — contradizendo a política, que promete
// que o login oficial não guarda token nem perfil. O valor do registro é
// operacional (saber quando perguntar de novo), não probatório: o que demonstra
// que o aviso existiu é o código público e a release marcada.

export const LEGAL_SITE = "https://www.corneta.live";

const LEGAL_PATHS = {
  terms: "/legal/terms-of-use",
  privacy: "/legal/privacy",
} as const;

/** URL do documento no idioma do app.
 *
 *  O português mora na raiz (é a URL publicada e a que vincula juridicamente);
 *  o inglês leva o prefixo `/en`, como o resto do site. Quem está com o app em
 *  inglês tem que cair na tradução — mandar pro texto em português seria pedir
 *  que a pessoa aceite o que não consegue ler. */
export function legalUrl(
  locale: string,
  doc: keyof typeof LEGAL_PATHS,
): string {
  const prefix = locale === "en" ? "/en" : "";
  return `${LEGAL_SITE}${prefix}${LEGAL_PATHS[doc]}`;
}

/**
 * Versão dos termos que exige aceite.
 *
 * NÃO é a data de revisão dos documentos (`LEGAL_UPDATED_ISO`, no site), que sobe
 * a cada correção de vírgula. Esta só sobe quando a mudança é MATERIAL — passar a
 * cobrar, pedir escopo novo de OAuth, limitar o login oficial. Subir aqui invalida
 * o aceite guardado e faz o app avisar de novo quem já tinha aceitado a versão
 * anterior (ver o fluxo "reaccept" em components/Onboarding.tsx).
 */
export const LEGAL_ACCEPT_VERSION = "2026-08-01";

const KEY = "corneta.legal.accepted";

export interface LegalAcceptance {
  /** `LEGAL_ACCEPT_VERSION` vigente quando o usuário passou pelo aviso. */
  version: string;
  /** ISO 8601 do momento do aceite. */
  at: string;
}

export function readAcceptance(): LegalAcceptance | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as LegalAcceptance).version === "string" &&
      typeof (parsed as LegalAcceptance).at === "string"
    ) {
      return parsed as LegalAcceptance;
    }
  } catch {
    // Storage indisponível ou JSON corrompido: trata como não aceito. O aviso
    // reaparece, que é o lado seguro do erro.
  }
  return null;
}

/** Já passou pelo aviso da versão VIGENTE? */
export function acceptedCurrent(): boolean {
  return readAcceptance()?.version === LEGAL_ACCEPT_VERSION;
}

/**
 * Marca o aceite da versão vigente. Idempotente de propósito: quem reabre o tour
 * por "Rever o tour" não deve perder a data do aceite original.
 */
export function recordAcceptance(): void {
  if (acceptedCurrent()) return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: LEGAL_ACCEPT_VERSION,
        at: new Date().toISOString(),
      } satisfies LegalAcceptance),
    );
  } catch {
    // Sem storage o aceite não fica registrado e o aviso volta na próxima
    // abertura. Preferível a travar a entrada no app por causa disso.
  }
}
