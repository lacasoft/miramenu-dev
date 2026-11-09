import { type DependencyCheck, failingDependencies } from './readiness';

const passing = (name: string): DependencyCheck => ({
  name,
  check: () => Promise.resolve(),
});
const failing = (name: string): DependencyCheck => ({
  name,
  check: () => Promise.reject(new Error('connection refused')),
});
const hanging = (name: string): DependencyCheck => ({
  name,
  check: () => new Promise(() => {}),
});

describe('failingDependencies', () => {
  it('returns nothing when every dependency answers', async () => {
    await expect(
      failingDependencies([passing('postgres_catalog'), passing('smtp')], 100),
    ).resolves.toEqual([]);
  });

  it('names the dependencies that fail, in their declared order', async () => {
    const checks = [
      passing('postgres_catalog'),
      failing('redis_cache'),
      failing('object_storage'),
    ];
    await expect(failingDependencies(checks, 100)).resolves.toEqual([
      'redis_cache',
      'object_storage',
    ]);
  });

  it('counts a dependency that never answers as failing, within the timeout', async () => {
    const startedAt = Date.now();
    await expect(
      failingDependencies([hanging('redis_queue'), passing('smtp')], 50),
    ).resolves.toEqual(['redis_queue']);
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });
});
