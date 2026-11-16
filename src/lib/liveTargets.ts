import type { PlatformId, Target, TargetStatus } from "./types";

export interface LiveTarget {
  id: string;
  name: string;
  platformId: PlatformId;
}

/**
 * A stable digest of which destinations the engine streams. Metrics arrive several times a
 * second; the list only needs to change when a destination joins or leaves.
 */
export function liveTargetsSignature(
  targets: Record<string, TargetStatus>,
): string {
  return JSON.stringify(
    Object.values(targets)
      .map((t) => [t.targetId, t.name, t.platformId])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

/**
 * The destinations this live streams, in the order the user arranged them. The engine picks them
 * at start, so a destination switched off or removed mid-live keeps its row while it transmits.
 */
export function liveTargetRows(
  signature: string,
  configTargets: Target[],
): LiveTarget[] {
  const order = new Map(configTargets.map((t, index) => [t.id, index]));
  const rows = (JSON.parse(signature) as [string, string, PlatformId][]).map(
    ([id, name, platformId]) => ({ id, name, platformId }),
  );
  const position = (id: string) => order.get(id) ?? Number.MAX_SAFE_INTEGER;
  return rows.sort((a, b) => position(a.id) - position(b.id));
}
