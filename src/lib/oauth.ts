// Client IDs são públicos. Secrets ficam no servidor (Kick oficial) ou no cofre (BYOK), nunca no Vite.
export const OAUTH = {
  twitchClientId: import.meta.env.VITE_TWITCH_CLIENT_ID ?? "",
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "",
  kickClientId: import.meta.env.VITE_KICK_CLIENT_ID ?? "",
  // Vazio equivale a ausente; somente dev assume a porta do workspace web.
  setupApiUrl:
    import.meta.env.VITE_SETUP_API_URL?.trim() ||
    (import.meta.env.DEV ? "http://localhost:7390" : ""),
};

export const HAS_TWITCH_OAUTH = OAUTH.twitchClientId.trim().length > 0;
