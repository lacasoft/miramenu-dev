export interface CachedEntry<T> {
  value: T;
  storedAtMs: number;
}

/** A cache that may fail at any time; reads and writes never throw (ADR-0017). */
export interface FailSoftCache<T> {
  get(key: string): Promise<CachedEntry<T> | null>;
  set(key: string, entry: CachedEntry<T>, ttlSeconds: number): Promise<void>;
}

export interface ReadThroughOptions<T> {
  key: string;
  cache: FailSoftCache<T>;
  /** Reads the source of truth; null when the thing does not exist. */
  load: () => Promise<T | null>;
  refreshAfterMs: number;
  ttlSeconds: number;
  nowMs: number;
}

/**
 * ADR-0016: a fresh copy is served from the cache; an older one is refreshed from
 * Postgres, and if Postgres fails the older copy is still served, up to its TTL.
 * Not-found results are not cached, so a new QR works at once.
 */
export async function readThrough<T>(
  options: ReadThroughOptions<T>,
): Promise<T | null> {
  const cached = await options.cache.get(options.key);
  if (cached && options.nowMs - cached.storedAtMs < options.refreshAfterMs) {
    return cached.value;
  }

  let value: T | null;
  try {
    value = await options.load();
  } catch (error) {
    if (cached) return cached.value;
    throw error;
  }

  if (value !== null) {
    await options.cache.set(
      options.key,
      { value, storedAtMs: options.nowMs },
      options.ttlSeconds,
    );
  }
  return value;
}
