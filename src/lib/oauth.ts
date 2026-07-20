// Client IDs são públicos e podem fazer parte do bundle. Client secrets nunca entram no Vite:
// quando necessários, são fornecidos pelo usuário e armazenados no cofre nativo do SO.
export const OAUTH = {
  twitchClientId: import.meta.env.VITE_TWITCH_CLIENT_ID ?? "",
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "",
  kickClientId: import.meta.env.VITE_KICK_CLIENT_ID ?? "",
  setupApiUrl:
    import.meta.env.VITE_SETUP_API_URL ??
    (import.meta.env.DEV ? "http://localhost:3000" : ""),
};

export const HAS_TWITCH_OAUTH = OAUTH.twitchClientId.trim().length > 0;
export const HAS_YOUTUBE_OAUTH = OAUTH.googleClientId.trim().length > 0;
export const HAS_KICK_OAUTH = OAUTH.kickClientId.trim().length > 0;
