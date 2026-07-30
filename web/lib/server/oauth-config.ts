import "server-only";

const first = (...names: string[]) => {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
};

export type OAuthServerConfig = {
  twitch: { clientId: string };
  youtube: { clientId: string };
  kick: {
    clientId: string;
    clientSecret: string;
    redirectUris: ReadonlySet<string>;
  };
};

export function getOAuthConfig(): OAuthServerConfig {
  const twitchClientId = first("TWITCH_CLIENT_ID", "VITE_TWITCH_CLIENT_ID");
  const youtubeClientId = first(
    "GOOGLE_CLIENT_ID",
    "YOUTUBE_CLIENT_ID",
    "VITE_GOOGLE_CLIENT_ID",
  );
  const kickClientId = first("KICK_CLIENT_ID", "VITE_KICK_CLIENT_ID");
  const kickClientSecret = first("KICK_CLIENT_SECRET");
  const redirectUris = first("KICK_REDIRECT_URIS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    twitch: { clientId: twitchClientId },
    youtube: { clientId: youtubeClientId },
    kick: {
      clientId: kickClientId,
      clientSecret: kickClientSecret,
      redirectUris: new Set(
        redirectUris.length ? redirectUris : ["http://localhost:7395/callback"],
      ),
    },
  };
}
