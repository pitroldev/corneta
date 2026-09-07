export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Espelha `commands::START_CANCELLED` (Rust). É CÓDIGO, não frase: o backend
 *  devolve isto quando a própria pessoa cancelou o início da live, e o front
 *  engole o toast de erro. Enquanto era a frase "Início cancelado.", traduzir o
 *  backend quebrava a comparação em silêncio — e o cancelamento voltava a
 *  aparecer como falha. Mudou de um lado? Muda do outro. */
export const START_CANCELLED = "corneta:start-cancelled";
