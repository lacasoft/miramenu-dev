import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/environment';
import { REDIS_QUEUE, RedisModule } from '../redis/redis.module';

/**
 * BullMQ on the queue's Redis client, the one that waits and retries (ADR-0017), under a
 * configurable prefix so separate runs (e.g. each e2e file) never take each other's jobs.
 * Contexts register their own queues with BullModule.registerQueue.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_QUEUE, APP_CONFIG],
      useFactory: (connection: Redis, config: AppConfig) => ({
        connection,
        prefix: config.queue.prefix,
      }),
    }),
  ],
})
export class QueueModule {}
