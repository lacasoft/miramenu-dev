import type { Redis } from 'ioredis';
import type { CachedEntry, FailSoftCache } from './read-through-cache';

/**
 * Redis as a cache that never fails a request (ADR-0017): use it with the REDIS_CACHE
 * client, which neither waits nor retries. Errors read as a miss, and a failed write only
 * means the next read goes to Postgres.
 */
export class RedisFailSoftCache<T> implements FailSoftCache<T> {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<CachedEntry<T> | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as CachedEntry<T>) : null;
    } catch {
      return null;
    }
  }

  async set(
    key: string,
    entry: CachedEntry<T>,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(entry), 'EX', ttlSeconds);
    } catch {
      // The next read refreshes it from Postgres.
    }
  }

  /** Removes the keys; false when Redis did not answer, so the caller can retry. */
  async delete(keys: readonly string[]): Promise<boolean> {
    if (keys.length === 0) return true;
    try {
      await this.redis.del(...keys);
      return true;
    } catch {
      return false;
    }
  }
}
