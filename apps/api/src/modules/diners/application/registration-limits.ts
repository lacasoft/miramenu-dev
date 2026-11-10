import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG } from '../../../infrastructure/config/config.module';
import type { AppConfig } from '../../../infrastructure/config/environment';
import { REDIS_CACHE } from '../../../infrastructure/redis/redis.module';
import { limitWaitSeconds, type SendLimit } from '../domain/send-policy';
import { registrationUnavailable, tooManyRequests } from './errors';

const DAY_SECONDS = 24 * 60 * 60;
const HOUR_SECONDS = 60 * 60;

export interface Requester {
  phoneKey: string;
  deviceId: string;
  ip: string;
}

/**
 * Limits on sending codes, because each send costs (design: "por celular y por
 * dispositivo"). The device id comes from the client, so a per-IP limit backs it up.
 * Fixed windows in Redis; like the codes, they fail closed.
 */
@Injectable()
export class RegistrationLimits {
  private readonly settings: AppConfig['dinerRegistration'];

  constructor(
    @Inject(REDIS_CACHE) private readonly redis: Redis,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.settings = config.dinerRegistration;
  }

  limitsFor(requester: Requester): SendLimit[] {
    return [
      {
        key: `diners:limit:phone:${requester.phoneKey}`,
        max: this.settings.sendsPerPhonePerDay,
        windowSeconds: DAY_SECONDS,
      },
      {
        key: `diners:limit:device:${requester.deviceId}`,
        max: this.settings.sendsPerDevicePerDay,
        windowSeconds: DAY_SECONDS,
      },
      {
        key: `diners:limit:ip:${requester.ip}`,
        max: this.settings.sendsPerIpPerHour,
        windowSeconds: HOUR_SECONDS,
      },
    ];
  }

  /** Counts one send against every limit; 429 with Retry-After if any is exceeded. */
  async consume(requester: Requester): Promise<void> {
    const limits = this.limitsFor(requester);
    const transaction = this.redis.multi();
    for (const limit of limits) {
      transaction
        .incr(limit.key)
        .expire(limit.key, limit.windowSeconds, 'NX')
        .pttl(limit.key);
    }
    let results: [Error | null, unknown][] | null;
    try {
      results = await transaction.exec();
    } catch {
      throw registrationUnavailable();
    }
    if (!results || results.some(([error]) => error !== null))
      throw registrationUnavailable();
    const wait = limitWaitSeconds(
      limits.map((limit, index) => ({
        count: Number(results[index * 3][1]),
        ttlMs: Number(results[index * 3 + 2][1]),
        max: limit.max,
      })),
    );
    if (wait > 0) throw tooManyRequests(wait);
  }
}
