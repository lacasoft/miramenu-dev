import type { INestApplication } from '@nestjs/common';
import { errorResponseSchema } from '@miramenu/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { AppConfig } from '../src/infrastructure/config/environment';
import { createTestApp } from './support/test-app';

// Port 1 is never open locally or in CI, so connections are refused at once.
const UNREACHABLE_PORT = 1;

async function dependencyReport(
  configure?: (config: AppConfig) => AppConfig,
): Promise<{ status: number; body: unknown }> {
  const app: INestApplication<App> = await createTestApp({ configure });
  try {
    const response = await request(app.getHttpServer()).get(
      '/health/dependencies',
    );
    return { status: response.status, body: response.body };
  } finally {
    await app.close();
  }
}

describe('Health (e2e)', () => {
  it('reports every dependency up against the local services', async () => {
    await expect(dependencyReport()).resolves.toEqual({
      status: 200,
      body: { status: 'ok' },
    });
  });

  it('names both Redis clients, and nothing else, when Redis is unreachable', async () => {
    const report = await dependencyReport((config) => ({
      ...config,
      redis: { ...config.redis, port: UNREACHABLE_PORT },
    }));

    expect(report.status).toBe(503);
    expect(errorResponseSchema.parse(report.body)).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Unavailable: redis_cache, redis_queue',
    });
  });

  it('names the object storage when its bucket cannot be reached', async () => {
    const report = await dependencyReport((config) => ({
      ...config,
      storage: { ...config.storage, bucket: 'missing-bucket' },
    }));

    expect(report.status).toBe(503);
    expect(errorResponseSchema.parse(report.body).message).toBe(
      'Unavailable: object_storage',
    );
  });

  it('names SMTP when the mail server is unreachable', async () => {
    const report = await dependencyReport((config) => ({
      ...config,
      mail: { ...config.mail, port: UNREACHABLE_PORT },
    }));

    expect(report.status).toBe(503);
    expect(errorResponseSchema.parse(report.body).message).toBe(
      'Unavailable: smtp',
    );
  });

  it('keeps the liveness probe up while a dependency is down', async () => {
    const app = await createTestApp({
      configure: (config) => ({
        ...config,
        redis: { ...config.redis, port: UNREACHABLE_PORT },
      }),
    });
    try {
      await request(app.getHttpServer())
        .get('/health/live')
        .expect(200, { status: 'ok' });
    } finally {
      await app.close();
    }
  });
});
