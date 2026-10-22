import type { ComponentType } from "react";

export interface AccountUi {
  /** The account's row in the chat settings: sign-in, and the user's own app credentials where supported. */
  AccountPanel: ComponentType;
  /** Whether the chat settings can offer a sign-in or the user's own app at all. */
  setupAvailable: boolean;
  /** Readiness known without the backend, such as a client ID built into the app. */
  loginReady?: boolean;
}

export interface ChatUi {
  /** Settings shown once when the user has any source of this platform. */
  ChannelSettings?: ComponentType;
}
