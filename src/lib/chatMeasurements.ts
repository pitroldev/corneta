/** Prune evicted virtualizer measurements only after scroll-anchor compensation. Keep this adapter tested against virtualizer upgrades. */
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
