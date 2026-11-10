import {
  Controller,
  Get,
  Header,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import type { DataSource } from 'typeorm';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/environment';
import type { DatabaseContext } from '../database/database-contexts';
import { Mailer } from '../mail/mailer';
import { REDIS_CACHE, REDIS_QUEUE } from '../redis/redis.module';
import { ObjectStorage } from '../storage/object-storage';
import { VerificationSender } from '../verification/verification-sender';
import { type DependencyCheck, failingDependencies } from './readiness';

const postgres = (
  context: DatabaseContext,
  dataSource: DataSource,
): DependencyCheck => ({
  name: `postgres_${context}`,
  check: async () => {
    await dataSource.query('SELECT 1');
  },
});

const redis = (name: string, client: Redis): DependencyCheck => ({
  name,
  check: async () => {
    if (client.status !== 'ready') throw new Error(`status ${client.status}`);
    await client.ping();
  },
});

@Controller('health')
export class HealthController {
  private readonly checks: readonly DependencyCheck[];

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @InjectDataSource('business_access') businessAccess: DataSource,
    @InjectDataSource('catalog') catalog: DataSource,
    @InjectDataSource('diners') diners: DataSource,
    @InjectDataSource('interactions') interactions: DataSource,
    @InjectDataSource('measurement') measurement: DataSource,
    @Inject(REDIS_CACHE) cache: Redis,
    @Inject(REDIS_QUEUE) queue: Redis,
    storage: ObjectStorage,
    mailer: Mailer,
    verification: VerificationSender,
  ) {
    this.checks = [
      postgres('business_access', businessAccess),
      postgres('catalog', catalog),
      postgres('diners', diners),
      postgres('interactions', interactions),
      postgres('measurement', measurement),
      redis('redis_cache', cache),
      redis('redis_queue', queue),
      { name: 'object_storage', check: () => storage.checkBucket() },
      { name: 'smtp', check: () => mailer.verify() },
      { name: 'verification_provider', check: () => verification.verify() },
    ];
  }

  /**
   * The process is up. This is the probe for load balancers and orchestrators: it never
   * touches a dependency, because the API is designed to keep serving when one falls
   * (the menu from cache if Postgres is down, from Postgres if Redis is down).
   */
  @Get('live')
  @Header('Cache-Control', 'no-store')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Monitoring report: 200 when every dependency answers, otherwise 503 naming the ones
   * that do not. Never use it to take the API out of rotation; alert on it instead.
   */
  @Get('dependencies')
  @Header('Cache-Control', 'no-store')
  async dependencies(): Promise<{ status: 'ok' }> {
    const failing = await failingDependencies(
      this.checks,
      this.config.healthCheckTimeoutMs,
    );
    if (failing.length > 0) {
      throw new ServiceUnavailableException(
        `Unavailable: ${failing.join(', ')}`,
      );
    }
    return { status: 'ok' };
  }
}
