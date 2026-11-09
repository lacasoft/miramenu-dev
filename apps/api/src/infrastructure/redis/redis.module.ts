import {
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/environment';

/** Fails fast: no offline queue and no retries, so a slow Redis never delays a request. */
export const REDIS_CACHE = Symbol('REDIS_CACHE');
/** Waits and retries, as queues need (BullMQ requires maxRetriesPerRequest: null). */
export const REDIS_QUEUE = Symbol('REDIS_QUEUE');

function createClient(
  config: AppConfig['redis'],
  purpose: 'cache' | 'queue',
): Redis {
  const logger = new Logger(`Redis:${purpose}`);
  const base = {
    host: config.host,
    port: config.port,
    password: config.password,
    connectionName: `miramenu-api:${purpose}`,
  };
  // ADR-0017: two clients with opposite failure behavior.
  const client =
    purpose === 'cache'
      ? new Redis({
          ...base,
          commandTimeout: config.cacheTimeoutMs,
          maxRetriesPerRequest: 0,
          enableOfflineQueue: false,
        })
      : new Redis({ ...base, maxRetriesPerRequest: null });
  client.on('error', (error: Error) => logger.warn(error.message));
  return client;
}

async function close(client: Redis): Promise<void> {
  if (client.status === 'ready') {
    await client.quit();
  } else {
    client.disconnect();
  }
}

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS_CACHE) private readonly cache: Redis,
    @Inject(REDIS_QUEUE) private readonly queue: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([close(this.cache), close(this.queue)]);
  }
}

@Module({
  providers: [
    {
      provide: REDIS_CACHE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createClient(config.redis, 'cache'),
    },
    {
      provide: REDIS_QUEUE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createClient(config.redis, 'queue'),
    },
    RedisShutdown,
  ],
  exports: [REDIS_CACHE, REDIS_QUEUE],
})
export class RedisModule {}
