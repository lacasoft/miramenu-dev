import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG } from '../../../infrastructure/config/config.module';
import type { AppConfig } from '../../../infrastructure/config/environment';
import { REDIS_CACHE } from '../../../infrastructure/redis/redis.module';
import { tooManyComments } from './errors';

const HOUR_SECONDS = 60 * 60;

/**
 * Comments a diner may post or edit per hour (ADR-0040), so nobody floods the moderation
 * queue. A fixed window in Redis. Unlike codes and logins, it fails open: if Redis does
 * not answer, diners keep commenting, because every comment is still moderated by hand.
 */
@Injectable()
export class CommentLimits {
  private readonly logger = new Logger(CommentLimits.name);
  private readonly perHour: number;

  constructor(
    @Inject(REDIS_CACHE) private readonly redis: Redis,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.perHour = config.interactions.commentsPerDinerPerHour;
  }

  async consume(dinerId: string): Promise<void> {
    const key = `interactions:comment-limit:${dinerId}`;
    let results: [Error | null, unknown][] | null;
    try {
      results = await this.redis
        .multi()
        .incr(key)
        .expire(key, HOUR_SECONDS, 'NX')
        .pttl(key)
        .exec();
    } catch (error) {
      this.logger.warn(
        `Comment limit not checked: ${error instanceof Error ? error.message : 'Redis failed'}`,
      );
      return;
    }
    if (!results || results.some(([error]) => error !== null)) {
      this.logger.warn('Comment limit not checked: Redis refused the count');
      return;
    }
    const count = Number(results[0][1]);
    const ttlMs = Number(results[2][1]);
    if (count > this.perHour)
      throw tooManyComments(Math.max(1, Math.ceil(ttlMs / 1000)));
  }
}
