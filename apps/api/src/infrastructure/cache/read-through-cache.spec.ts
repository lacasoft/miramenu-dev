import {
  type CachedEntry,
  type FailSoftCache,
  readThrough,
} from './read-through-cache';

class MemoryCache implements FailSoftCache<string> {
  readonly entries = new Map<string, CachedEntry<string>>();

  get(key: string): Promise<CachedEntry<string> | null> {
    return Promise.resolve(this.entries.get(key) ?? null);
  }

  set(key: string, entry: CachedEntry<string>): Promise<void> {
    this.entries.set(key, entry);
    return Promise.resolve();
  }
}

const NOW = 10_000_000;
const REFRESH = 60_000;

const options = (
  cache: MemoryCache,
  load: () => Promise<string | null>,
  nowMs = NOW,
) => ({
  key: 'qr:k7m2x9p',
  cache,
  load,
  refreshAfterMs: REFRESH,
  ttlSeconds: 86_400,
  nowMs,
});

const postgresDown = () => Promise.reject(new Error('connection refused'));

describe('readThrough (ADR-0016)', () => {
  it('serves a fresh copy without touching Postgres', async () => {
    const cache = new MemoryCache();
    cache.entries.set('qr:k7m2x9p', {
      value: 'cached',
      storedAtMs: NOW - 10_000,
    });
    const load = jest.fn(() => Promise.resolve('fresh'));

    await expect(readThrough(options(cache, load))).resolves.toBe('cached');
    expect(load).not.toHaveBeenCalled();
  });

  it('refreshes a copy older than 60 s and stores the new value', async () => {
    const cache = new MemoryCache();
    cache.entries.set('qr:k7m2x9p', {
      value: 'old',
      storedAtMs: NOW - REFRESH,
    });

    await expect(
      readThrough(options(cache, () => Promise.resolve('new'))),
    ).resolves.toBe('new');
    expect(cache.entries.get('qr:k7m2x9p')).toEqual({
      value: 'new',
      storedAtMs: NOW,
    });
  });

  it('keeps serving the old copy when Postgres fails', async () => {
    const cache = new MemoryCache();
    cache.entries.set('qr:k7m2x9p', {
      value: 'old',
      storedAtMs: NOW - 3_600_000,
    });

    await expect(readThrough(options(cache, postgresDown))).resolves.toBe(
      'old',
    );
  });

  it('fails when Postgres fails and there is no copy', async () => {
    await expect(
      readThrough(options(new MemoryCache(), postgresDown)),
    ).rejects.toThrow('connection refused');
  });

  it('does not cache a missing value, so a new QR works at once', async () => {
    const cache = new MemoryCache();

    await expect(
      readThrough(options(cache, () => Promise.resolve(null))),
    ).resolves.toBeNull();
    expect(cache.entries.size).toBe(0);
  });
});
