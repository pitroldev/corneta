/** Waits for a pause in typing so each keystroke does not reach the platforms. */
export const CATEGORY_SEARCH_DEBOUNCE_MS = 250;

/** Mirrors the native lower bound; one letter matches too much to be useful. */
export function shouldSearchCategory(query: string): boolean {
  return query.trim().length >= 2;
}

/** Arrow keys move through the suggestions and wrap; any other key leaves the highlight alone. */
export function moveHighlight(
  current: number,
  count: number,
  key: string,
): number | null {
  if (count <= 0) return null;
  if (key === "ArrowDown") return current < 0 ? 0 : (current + 1) % count;
  if (key === "ArrowUp") return current <= 0 ? count - 1 : current - 1;
  return null;
}
