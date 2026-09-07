export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Must match commands::START_CANCELLED in Rust. This cancellation code is never localized. */
export const START_CANCELLED = "corneta:start-cancelled";
