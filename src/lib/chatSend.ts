import type { ChatSource } from "./types";
import type { I18n } from "./i18n";

/** Tradutor por parâmetro: este módulo não é componente e não pode usar hook —
 *  e um idioma global viraria corrida entre a janela principal e o popout. */
export type Translate = I18n["t"];

/** Rótulo da fonte igual ao backend (value quando o nome é só espaço) — pra casar moderação. */
export const srcLabel = (x: ChatSource) =>
  x.name.trim() === "" ? x.value : x.name;

/** Estado de login por plataforma (derivado de chatLogin.*.state === "connected"). */
export interface SendReady {
  twitch: boolean;
  youtube: boolean;
  kick: boolean;
}

/**
 * Linha de status do envio, por fonte — compartilhada entre a tela de Chat e o popout
 * (lá vira title do Enviar desabilitado). Twitch só envia depois que o IRC autentica
 * (chatAuth.ok); YouTube/Kick mandam via HTTP na hora do login.
 *
 * "logado como @fulano" reusa chat.loginrow.signedInAs de propósito: é a mesma
 * frase da linha de login, e duas chaves pro mesmo texto viram duas traduções
 * divergentes na primeira revisão.
 */
export function sendStatusLine(
  sendTargets: ChatSource[],
  chatAuth: Record<string, { login: string; ok: boolean } | undefined>,
  ready: SendReady,
  t: Translate,
): string {
  return sendTargets
    .map((x) => {
      const label = srcLabel(x);
      // Nome da plataforma é nome próprio: entra como variável, não traduz.
      if (x.platform === "youtube")
        return ready.youtube
          ? t("chat.send.status.signedIn", { platform: "YouTube" })
          : t("chat.send.status.signIn", { label, platform: "YouTube" });
      if (x.platform === "kick")
        return ready.kick
          ? t("chat.send.status.signedIn", { platform: "Kick" })
          : t("chat.send.status.signIn", { label, platform: "Kick" });
      const a = chatAuth[x.id];
      if (a?.ok) return t("chat.loginrow.signedInAs", { login: a.login });
      if (ready.twitch) return t("chat.send.status.reconnect", { label });
      if (a && !a.ok) return t("chat.send.status.invalidToken", { label });
      return t("chat.send.status.connect", { label });
    })
    .join(" · ");
}
