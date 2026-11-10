const HOUR_MS = 60 * 60 * 1000;

/** What an inserted entry adds to its hour. */
export interface InsertedEntry {
  branchId: string;
  dishId: string;
  enteredAt: Date;
  exposureMs: number;
  validView: boolean;
  quickSkip: boolean;
}

export interface AggregateDelta {
  branchId: string;
  dishId: string;
  /** The UTC hour the entry started in: a late entry adds to its own hour (design). */
  hour: Date;
  entries: number;
  views: number;
  /** Only entries that reached a valid view expose (the demo's average exposure). */
  exposureMs: number;
  quickSkips: number;
}

export const hourOf = (instant: Date): Date =>
  new Date(Math.floor(instant.getTime() / HOUR_MS) * HOUR_MS);

const keyOf = (delta: { branchId: string; dishId: string; hour: Date }) =>
  `${delta.branchId}|${delta.dishId}|${delta.hour.toISOString()}`;

/**
 * The additions to each (branch, dish, hour), in key order: every worker locks the
 * aggregate rows in the same order, so two batches never deadlock each other.
 */
export function aggregateDeltas(
  entries: readonly InsertedEntry[],
): AggregateDelta[] {
  const deltas = new Map<string, AggregateDelta>();
  for (const entry of entries) {
    const hour = hourOf(entry.enteredAt);
    const key = keyOf({ ...entry, hour });
    const delta = deltas.get(key) ?? {
      branchId: entry.branchId,
      dishId: entry.dishId,
      hour,
      entries: 0,
      views: 0,
      exposureMs: 0,
      quickSkips: 0,
    };
    delta.entries += 1;
    if (entry.validView) {
      delta.views += 1;
      delta.exposureMs += entry.exposureMs;
    }
    if (entry.quickSkip) delta.quickSkips += 1;
    deltas.set(key, delta);
  }
  return [...deltas.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, delta]) => delta);
}
