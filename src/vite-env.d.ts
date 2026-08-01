/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_TWITCH_CLIENT_ID?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_KICK_CLIENT_ID?: string;
  /** Token público de ingestão (nunca Personal API Key). */
  readonly VITE_POSTHOG_TOKEN?: string;
  /** Origin HTTPS do projeto, por exemplo https://us.i.posthog.com. */
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_BUILD_SHA?: string;
  readonly VITE_TELEMETRY_DISABLED?: "0" | "1";
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
