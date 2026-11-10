import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { PublishedMenu } from '@miramenu/contracts';
import type { Redis } from 'ioredis';
import type { DataSource } from 'typeorm';
import { readThrough } from '../../../infrastructure/cache/read-through-cache';
import { RedisFailSoftCache } from '../../../infrastructure/cache/redis-fail-soft-cache';
import { APP_CONFIG } from '../../../infrastructure/config/config.module';
import type { AppConfig } from '../../../infrastructure/config/environment';
import { selectRows } from '../../../infrastructure/database/query';
import { REDIS_CACHE } from '../../../infrastructure/redis/redis.module';
import type { MenuContent } from '../domain/menu-snapshot';
import { menuUnavailable, notFound } from './errors';

const menuKey = (branchId: string) => `catalog:menu:${branchId}`;
const INVALIDATION_ATTEMPTS = 3;
const INVALIDATION_BACKOFF_MS = 100;

/**
 * Contract "Menú publicado de una sucursal": the latest PublishedMenu, the only thing a
 * diner reads (ADR-0003). Cached in Redis: refreshed after 60 s, kept 24 h and served if
 * Postgres fails (ADR-0016); a slow Redis reads as a miss (ADR-0017).
 */
@Injectable()
export class PublishedMenuService {
  private readonly cache: RedisFailSoftCache<PublishedMenu>;
  private readonly logger = new Logger('Catalog');

  constructor(
    @InjectDataSource('catalog') private readonly dataSource: DataSource,
    @Inject(REDIS_CACHE) redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.cache = new RedisFailSoftCache<PublishedMenu>(redis);
  }

  /** 404 before the branch's first publication; 503 when Postgres fails and nothing is cached. */
  async latest(branchId: string): Promise<PublishedMenu> {
    let menu: PublishedMenu | null;
    try {
      menu = await readThrough({
        key: menuKey(branchId),
        cache: this.cache,
        load: () => this.load(branchId),
        refreshAfterMs: this.config.menuCache.refreshSeconds * 1000,
        ttlSeconds: this.config.menuCache.ttlHours * 3600,
        nowMs: Date.now(),
      });
    } catch {
      throw menuUnavailable();
    }
    if (!menu) throw notFound();
    return menu;
  }

  /**
   * Drops the cached copies after a publication commits, retrying a little (design: flujo
   * publicar, paso 5). If Redis still does not answer, each copy refreshes by itself
   * within the refresh interval.
   */
  async invalidate(branchIds: readonly string[]): Promise<void> {
    const keys = branchIds.map(menuKey);
    for (let attempt = 0; attempt < INVALIDATION_ATTEMPTS; attempt += 1) {
      if (await this.cache.delete(keys)) return;
      if (attempt < INVALIDATION_ATTEMPTS - 1) {
        await sleep(INVALIDATION_BACKOFF_MS * 2 ** attempt);
      }
    }
    this.logger.warn(
      `Menu cache not invalidated for ${keys.length} branch(es); copies refresh within ${this.config.menuCache.refreshSeconds} s`,
    );
  }

  private async load(branchId: string): Promise<PublishedMenu | null> {
    const [row] = await selectRows<{
      version: number;
      content: MenuContent;
      published_at: Date;
    }>(
      this.dataSource.manager,
      `SELECT pm.version, pm.content, pm.published_at FROM catalog.branch_state bs
       JOIN catalog.published_menu pm
         ON pm.branch_id = bs.branch_id AND pm.version = bs.menu_version
       WHERE bs.branch_id = $1`,
      [branchId],
    );
    if (!row) return null;
    return {
      branchId,
      version: row.version,
      publishedAt: row.published_at.toISOString(),
      profile: row.content.profile,
      categories: row.content.categories,
    };
  }
}
