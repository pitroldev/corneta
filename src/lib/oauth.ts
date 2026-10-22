// Client IDs are public; secrets belong on the server or in the vault, never in the Vite bundle.
export const OAUTH = {
  /** Keyed by account platform; each Rust provider applies its own. */
  officialClientIds: {
    twitch: import.meta.env.VITE_TWITCH_CLIENT_ID ?? "",
    youtube: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "",
    kick: import.meta.env.VITE_KICK_CLIENT_ID ?? "",
  },
  // Empty values count as absent; only development defaults to the web workspace port.
  setupApiUrl:
    import.meta.env.VITE_SETUP_API_URL?.trim() ||
    (import.meta.env.DEV ? "http://localhost:7390" : ""),
};

export const HAS_TWITCH_OAUTH =
  OAUTH.officialClientIds.twitch.trim().length > 0;
