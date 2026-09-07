/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_TWITCH_CLIENT_ID?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_KICK_CLIENT_ID?: string;
  /** Public ingestion token, never a Personal API Key. */
  readonly VITE_POSTHOG_TOKEN?: string;
  /** Project HTTPS origin, such as https://us.i.posthog.com. */
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_BUILD_SHA?: string;
  readonly VITE_TELEMETRY_DISABLED?: "0" | "1";
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
