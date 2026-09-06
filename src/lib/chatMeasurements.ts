/** TanStack Virtual keeps measurements by key across rotations of a bounded feed.
 * Prune only AFTER compensating the scroll anchor. Removing keys absent from the
 * current measurements does not invalidate any current row's geometry.
 * Keep this adapter covered against the installed virtualizer on upgrades. */
export function pruneChatMeasurements(
  sizes: Map<string | number | bigint, number>,
  messages: readonly { id: string }[],
): void {
  if (sizes.size === 0) return;
  const retained = new Set(messages.map((message) => message.id));
  for (const key of sizes.keys()) {
    if (typeof key !== "string" || !retained.has(key)) sizes.delete(key);
  }
}
