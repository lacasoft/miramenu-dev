import { Controller, Get, type INestApplication, Param } from '@nestjs/common';
import { errorResponseSchema } from '@miramenu/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';
import { createTestApp } from './support/test-app';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

@Controller('e2e-probe')
class ProbeController {
  @Get('failure')
  failure(): never {
    throw new Error('connect ECONNREFUSED example_password_leak');
  }

  @Get('items/:id')
  item(@Param('id', { schema: z.uuid() }) id: string): { id: string } {
    return { id };
  }
}

describe('HTTP contract (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [ProbeController] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers an unknown route with the error envelope and the request id header', async () => {
    const response = await request(app.getHttpServer())
      .get('/nowhere')
      .expect(404);

    const body = errorResponseSchema.parse(response.body);
    expect(body.code).toBe('NOT_FOUND');
    expect(response.headers['x-request-id']).toBe(body.requestId);
    expect(body.requestId).toMatch(UUID);
  });

  it('keeps a valid incoming request id and replaces an unsafe one', async () => {
    const kept = await request(app.getHttpServer())
      .get('/nowhere')
      .set('X-Request-Id', 'client-trace-0001');
    expect(kept.headers['x-request-id']).toBe('client-trace-0001');
    expect(kept.body.requestId).toBe('client-trace-0001');

    const replaced = await request(app.getHttpServer())
      .get('/nowhere')
      .set('X-Request-Id', '<script>alert(1)</script>');
    expect(replaced.body.requestId).toMatch(UUID);
  });

  it('hides the details of an unexpected error behind a generic 500', async () => {
    const response = await request(app.getHttpServer())
      .get('/e2e-probe/failure')
      .expect(500);

    expect(errorResponseSchema.parse(response.body)).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    expect(JSON.stringify(response.body)).not.toContain(
      'example_password_leak',
    );
  });

  it('validates parameters against their Zod schema', async () => {
    const invalid = await request(app.getHttpServer())
      .get('/e2e-probe/items/not-a-uuid')
      .expect(400);
    expect(errorResponseSchema.parse(invalid.body).code).toBe(
      'VALIDATION_FAILED',
    );

    const id = '6f1c2e0a-8b3d-4c5e-9f7a-1b2c3d4e5f60';
    await request(app.getHttpServer())
      .get(`/e2e-probe/items/${id}`)
      .expect(200, { id });
  });

  it('sends the security headers and hides the framework', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('allows no cross-origin request when no allowlist is configured', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .set('Origin', 'https://evil.example');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('CORS allowlist (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp({
      configure: (config) => ({
        ...config,
        corsAllowedOrigins: ['https://admin.example'],
      }),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('echoes an allowed origin with credentials and ignores any other', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/health/live')
      .set('Origin', 'https://admin.example');
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://admin.example',
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const other = await request(app.getHttpServer())
      .get('/health/live')
      .set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});
