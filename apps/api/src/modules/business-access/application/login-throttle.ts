import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  BUSINESS_ACCESS_ERROR_CODES,
  GENERIC_ERROR_CODES,
} from '@miramenu/contracts';
import type { Redis } from 'ioredis';
import { ApiException } from '../../../infrastructure/http/api-exception';
import { REDIS_CACHE } from '../../../infrastructure/redis/redis.module';
import {
  FAILURE_WINDOW_SECONDS,
  remainingWaitSeconds,
} from '../domain/login-throttle-policy';

export interface ThrottleKeys {
  email: string;
  ip: string;
}

/**
 * Login attempt limits in Redis (ADR-0021), by email and by IP. It fails closed: if
 * Redis cannot be reached, nobody logs in, because the limits cannot be checked.
 */
@Injectable()
export class LoginThrottle {
  constructor(@Inject(REDIS_CACHE) private readonly redis: Redis) {}

  /** The email is hashed so the key never stores an address. */
  keysFor(email: string, ip: string): ThrottleKeys {
    const emailHash = createHash('sha256').update(email).digest('hex');
    return {
      email: `business-access:login:email:${emailHash}`,
      ip: `business-access:login:ip:${ip}`,
    };
  }

  async assertAllowed(keys: ThrottleKeys, nowMs: number): Promise<void> {
    const states = await this.withRedis(() =>
      Promise.all([
        this.redis.hgetall(keys.email),
        this.redis.hgetall(keys.ip),
      ]),
    );
    const wait = Math.max(
      ...states.map((state) =>
        remainingWaitSeconds(
          Number(state.failures ?? 0),
          Number(state.lastFailureAt ?? 0),
          nowMs,
        ),
      ),
    );
    if (wait > 0) {
      throw new ApiException(
        429,
        GENERIC_ERROR_CODES.TOO_MANY_REQUESTS,
        'Too many failed attempts, retry later',
        {
          'Retry-After': String(wait),
        },
      );
    }
  }

  async recordFailure(keys: ThrottleKeys, nowMs: number): Promise<void> {
    await this.withRedis(async () => {
      const transaction = this.redis.multi();
      for (const key of [keys.email, keys.ip]) {
        transaction
          .hincrby(key, 'failures', 1)
          .hset(key, 'lastFailureAt', nowMs)
          .expire(key, FAILURE_WINDOW_SECONDS);
      }
      const results = await transaction.exec();
      if (!results || results.some(([error]) => error !== null))
        throw new Error('throttle write failed');
    });
  }

  /** A successful login clears the email's count; the IP's stays, against spraying. */
  async reset(keys: ThrottleKeys): Promise<void> {
    await this.withRedis(() => this.redis.del(keys.email));
  }

  private async withRedis<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      throw new ApiException(
        503,
        BUSINESS_ACCESS_ERROR_CODES.LOGIN_UNAVAILABLE,
        'Login is unavailable',
      );
    }
  }
}
