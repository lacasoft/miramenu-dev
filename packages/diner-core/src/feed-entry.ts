import {
  FEED_ENTRY_LIMITS,
  type FeedEntry,
  type FeedExit,
} from "@miramenu/contracts";

/**
 * A feed entry while it is open (ADR-0041): one dish's scene, from the moment it became the
 * active one until it closes. Exposure is the time the scene was in view, in the
 * foreground and with nothing covering the feed; a valid view needs one continuous
 * stretch of a second (the demo's definitions, design "Métricas").
 */
export interface OpenEntry {
  entryId: string;
  dishId: string;
  /** Epoch ms. */
  enteredAt: number;
  /** Exposure already folded, without the stretch in progress. */
  exposedMs: number;
  /** When the stretch in progress started; null while not exposed. */
  exposedSince: number | null;
  validView: boolean;
}

export function openEntry(
  entryId: string,
  dishId: string,
  now: number,
  exposed: boolean,
): OpenEntry {
  return {
    entryId,
    dishId,
    enteredAt: now,
    exposedMs: 0,
    exposedSince: exposed ? now : null,
    validView: false,
  };
}

/** Ends the stretch in progress, if any, counting it into the exposure. */
function fold(entry: OpenEntry, now: number): OpenEntry {
  if (entry.exposedSince === null) return entry;
  const stretch = Math.max(0, now - entry.exposedSince);
  return {
    ...entry,
    exposedMs: entry.exposedMs + stretch,
    exposedSince: null,
    validView: entry.validView || stretch >= FEED_ENTRY_LIMITS.validViewMs,
  };
}

/** The scene comes into view (on) or stops being in view: hidden page or a layer on top. */
export function setExposure(
  entry: OpenEntry,
  exposed: boolean,
  now: number,
): OpenEntry {
  if (exposed)
    return entry.exposedSince === null
      ? { ...entry, exposedSince: now }
      : entry;
  return fold(entry, now);
}

/** Closes the entry as the API takes it: once, immutable, capped at its exposure limit. */
export function closeEntry(
  entry: OpenEntry,
  branchId: string,
  exit: FeedExit,
  now: number,
): FeedEntry {
  const folded = fold(entry, now);
  return {
    entryId: folded.entryId,
    branchId,
    dishId: folded.dishId,
    enteredAt: new Date(folded.enteredAt).toISOString(),
    exposureMs: Math.min(
      Math.round(folded.exposedMs),
      FEED_ENTRY_LIMITS.maxExposureMs,
    ),
    validView: folded.validView,
    exit,
  };
}
