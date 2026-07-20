import type { ChatSource } from "./types";

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
 */
export function sendStatusLine(
  sendTargets: ChatSource[],
  chatAuth: Record<string, { login: string; ok: boolean } | undefined>,
  ready: SendReady,
): string {
  return sendTargets
    .map((x) => {
      const label = srcLabel(x);
      if (x.platform === "youtube")
        return ready.youtube ? "YouTube logado" : `${label}: entre no YouTube`;
      if (x.platform === "kick")
        return ready.kick ? "Kick logado" : `${label}: entre no Kick`;
      const a = chatAuth[x.id];
      if (a?.ok) return `logado como @${a.login}`;
      if (ready.twitch) return `${label}: reconecte o chat pra logar`;
      if (a && !a.ok) return `${label}: token de envio inválido`;
      return `${label}: conecte o chat pra logar`;
    })
    .join(" · ");
}
