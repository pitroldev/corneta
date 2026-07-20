import { json } from "@/lib/server/http";
import { getOAuthConfig } from "@/lib/server/oauth-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const config = getOAuthConfig();
  return json({
    schemaVersion: 1,
    providers: {
      twitch: {
        enabled: Boolean(config.twitch.clientId),
        clientId: config.twitch.clientId || null,
        flow: "direct-device",
      },
      youtube: {
        enabled: Boolean(config.youtube.clientId),
        clientId: config.youtube.clientId || null,
        flow: "direct-pkce",
      },
      kick: {
        enabled: Boolean(config.kick.clientId && config.kick.clientSecret),
        clientId: config.kick.clientId || null,
        flow: "brokered-pkce",
      },
    },
  });
}
