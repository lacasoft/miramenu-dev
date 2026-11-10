import type { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import {
  ADMIN_PASSWORD,
  AdminClient,
  clientIp,
  createBranch,
  createBusiness,
  ensureSuperadmin,
  login,
  SUPERADMIN,
} from './support/admin-fixtures';
import {
  createCategory,
  createDish,
  PROFILE,
  publishBusiness,
} from './support/catalog-fixtures';
import { createTestApp } from './support/test-app';

const UNREACHABLE_PORT = 1;

/** A business with a published base menu and two branches; only the first one is read. */
async function publishedBusiness(app: INestApplication<App>, ip: string) {
  const superadmin = await login(
    app,
    SUPERADMIN.email,
    SUPERADMIN.password,
    ip,
  );
  const business = await createBusiness(superadmin);
  const owner = await login(app, business.adminEmail, ADMIN_PASSWORD, ip);
  const read = (await createBranch(owner, business.id)).id;
  const unread = (await createBranch(owner, business.id)).id;
  await owner
    .send('put', `/admin/businesses/${business.id}/profile`, PROFILE)
    .expect(200);
  await createDish(
    owner,
    business.id,
    await createCategory(owner, business.id),
  );
  expect((await publishBusiness(owner, business.id)).status).toBe(201);
  return { business, owner, read, unread };
}

describe('The menu when a dependency fails, ADR-0016 and ADR-0017 (e2e)', () => {
  const ip = clientIp();

  beforeAll(async () => {
    await ensureSuperadmin();
  });

  it('serves the cached copy when Postgres fails, and 503 when there is none', async () => {
    // Every read tries Postgres first, so a served menu can only come from the fallback.
    const app = await createTestApp({
      configure: (config) => ({
        ...config,
        menuCache: { ...config.menuCache, refreshSeconds: 0 },
      }),
    });
    try {
      const { read, unread } = await publishedBusiness(app, ip);
      const menuOf = (branchId: string) =>
        request(app.getHttpServer()).get(`/branches/${branchId}/menu`);
      const before = await menuOf(read).expect(200);

      // Catalog's connection fails every query, as if Postgres stopped answering.
      await app.get<DataSource>(getDataSourceToken('catalog')).destroy();

      const during = await menuOf(read).expect(200);
      expect(during.body).toEqual(before.body);
      const missing = await menuOf(unread).expect(503);
      expect(missing.body.code).toBe('SERVICE_UNAVAILABLE');
    } finally {
      await app.close();
    }
  });

  it('reads the menu from Postgres and still publishes when Redis is down', async () => {
    const healthy = await createTestApp();
    const withoutRedis = await createTestApp({
      configure: (config) => ({
        ...config,
        redis: { ...config.redis, port: UNREACHABLE_PORT },
      }),
    });
    try {
      // Logging in needs Redis (ADR-0021); the session itself lives in Postgres.
      const { business, owner, read } = await publishedBusiness(healthy, ip);
      const ownerWithoutRedis = new AdminClient(
        withoutRedis,
        owner.cookieHeader,
        ip,
      );

      const menu = await request(withoutRedis.getHttpServer())
        .get(`/branches/${read}/menu`)
        .expect(200);
      expect(menu.body.version).toBe(1);

      const published = await publishBusiness(ownerWithoutRedis, business.id);
      expect(published.status).toBe(201);
      const after = await request(withoutRedis.getHttpServer())
        .get(`/branches/${read}/menu`)
        .expect(200);
      expect(after.body.version).toBe(2);
    } finally {
      await withoutRedis.close();
      await healthy.close();
    }
  });
});
