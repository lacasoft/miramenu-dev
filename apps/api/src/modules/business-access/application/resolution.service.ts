import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { GENERIC_ERROR_CODES, type Resolution } from '@miramenu/contracts';
import type { Redis } from 'ioredis';
import type { DataSource } from 'typeorm';
import { APP_CONFIG } from '../../../infrastructure/config/config.module';
import type { AppConfig } from '../../../infrastructure/config/environment';
import { ApiException } from '../../../infrastructure/http/api-exception';
import { REDIS_CACHE } from '../../../infrastructure/redis/redis.module';
import {
  type CachedEntry,
  type FailSoftCache,
  readThrough,
} from '../domain/read-through-cache';
import { branchUrl } from '../domain/site-url';
import { selectRows } from './sql';

interface LocationRow {
  branch_id: string;
  business_id: string;
  branch_subdomain: string | null;
  business_subdomain: string;
  slug: string;
}

const LOCATION_SQL = `
  SELECT b.id AS branch_id, b.business_id,
    (SELECT s.name FROM business_access.subdomain s WHERE s.branch_id = b.id AND s.is_current) AS branch_subdomain,
    (SELECT s.name FROM business_access.subdomain s
      WHERE s.business_id = b.business_id AND s.branch_id IS NULL AND s.is_current) AS business_subdomain,
    (SELECT bs.slug FROM business_access.branch_slug bs WHERE bs.branch_id = b.id AND bs.is_current) AS slug
  FROM business_access.branch b`;

/** Redis as a cache that never fails a request (ADR-0017): errors read as a miss. */
class RedisResolutionCache implements FailSoftCache<Resolution> {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<CachedEntry<Resolution> | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as CachedEntry<Resolution>) : null;
    } catch {
      return null;
    }
  }

  async set(
    key: string,
    entry: CachedEntry<Resolution>,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(entry), 'EX', ttlSeconds);
    } catch {
      // A failed cache write only means the next read goes to Postgres.
    }
  }
}

/**
 * Contract "Resolver un enlace QR o un subdominio a su sucursal". Cached in Redis: refreshed
 * after 60 s, kept 24 h and served if Postgres fails (ADR-0016). There is no explicit
 * invalidation: a stale entry lives at most the refresh interval, and old subdomains and
 * slugs keep resolving as aliases, so a stale URL still lands on the right branch.
 */
@Injectable()
export class ResolutionService {
  private readonly cache: RedisResolutionCache;

  constructor(
    @InjectDataSource('business_access')
    private readonly dataSource: DataSource,
    @Inject(REDIS_CACHE) redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.cache = new RedisResolutionCache(redis);
  }

  resolveQr(code: string): Promise<Resolution | null> {
    return this.cached(`business-access:resolution:qr:${code}`, async () => {
      const [row] = await selectRows<LocationRow>(
        this.dataSource.manager,
        `${LOCATION_SQL} JOIN business_access.qr_link q ON q.branch_id = b.id WHERE q.code = $1`,
        [code],
      );
      return row ? this.toResolution(row) : null;
    });
  }

  resolveSite(
    subdomain: string,
    slug: string | undefined,
  ): Promise<Resolution | null> {
    return this.cached(
      `business-access:resolution:site:${subdomain}:${slug ?? ''}`,
      async () => {
        const branchId = await this.branchOfSite(subdomain, slug);
        if (!branchId) return null;
        const [row] = await selectRows<LocationRow>(
          this.dataSource.manager,
          `${LOCATION_SQL} WHERE b.id = $1`,
          [branchId],
        );
        return row ? this.toResolution(row) : null;
      },
    );
  }

  /** Current or alias subdomain; then the slug, or the only branch when there is no slug. */
  private async branchOfSite(
    subdomain: string,
    slug: string | undefined,
  ): Promise<string | null> {
    const manager = this.dataSource.manager;
    const [site] = await selectRows<{
      business_id: string;
      branch_id: string | null;
    }>(
      manager,
      `SELECT business_id, branch_id FROM business_access.subdomain WHERE name = $1`,
      [subdomain],
    );
    if (!site) return null;
    if (site.branch_id) return site.branch_id;
    if (slug) {
      const [match] = await selectRows<{ branch_id: string }>(
        manager,
        `SELECT branch_id FROM business_access.branch_slug WHERE business_id = $1 AND slug = $2`,
        [site.business_id, slug],
      );
      return match?.branch_id ?? null;
    }
    const branches = await selectRows<{ id: string }>(
      manager,
      `SELECT id FROM business_access.branch WHERE business_id = $1 LIMIT 2`,
      [site.business_id],
    );
    return branches.length === 1 ? branches[0].id : null;
  }

  /** Postgres down with no cached copy: 503, a dependency failure, not an internal error. */
  private async cached(
    key: string,
    load: () => Promise<Resolution | null>,
  ): Promise<Resolution | null> {
    try {
      return await readThrough({
        key,
        cache: this.cache,
        load,
        refreshAfterMs: this.config.resolutionCache.refreshSeconds * 1000,
        ttlSeconds: this.config.resolutionCache.ttlHours * 3600,
        nowMs: Date.now(),
      });
    } catch {
      throw new ApiException(
        503,
        GENERIC_ERROR_CODES.SERVICE_UNAVAILABLE,
        'Resolution unavailable',
      );
    }
  }

  private toResolution(row: LocationRow): Resolution {
    return {
      businessId: row.business_id,
      branchId: row.branch_id,
      canonicalUrl: branchUrl(this.config.publicSiteUrl, {
        branchSubdomain: row.branch_subdomain,
        businessSubdomain: row.business_subdomain,
        slug: row.slug,
      }),
    };
  }
}
