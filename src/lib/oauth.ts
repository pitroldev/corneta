// Client ids/secrets do OAuth (envio/moderação), lidos do .env pelo Vite e repassados ao
// backend no boot. Vazio = a plataforma fica sem login no navegador.
export const OAUTH = {
  twitchClientId: import.meta.env.VITE_TWITCH_CLIENT_ID ?? "",
  twitchClientSecret: import.meta.env.VITE_TWITCH_CLIENT_SECRET ?? "",
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET ?? "",
  kickClientId: import.meta.env.VITE_KICK_CLIENT_ID ?? "",
  kickClientSecret: import.meta.env.VITE_KICK_CLIENT_SECRET ?? "",
};

export const HAS_TWITCH_OAUTH = OAUTH.twitchClientId.trim().length > 0;
export const HAS_YOUTUBE_OAUTH =
  OAUTH.googleClientId.trim().length > 0 && OAUTH.googleClientSecret.trim().length > 0;
export const HAS_KICK_OAUTH =
  OAUTH.kickClientId.trim().length > 0 && OAUTH.kickClientSecret.trim().length > 0;
