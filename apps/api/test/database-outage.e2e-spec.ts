import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { errorResponseSchema } from '@miramenu/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  AdminClient,
  clientIp,
  ensureSuperadmin,
  login,
  SUPERADMIN,
} from './support/admin-fixtures';
import { DatabaseRelay } from './support/database-relay';
import { DinerClient } from './support/diner-fixtures';
import {
  publishedRestaurant,
  type Restaurant,
} from './support/interaction-fixtures';
import { createTestApp } from './support/test-app';

/**
 * Design, "Fallas previstas": with Postgres down, likes, comments and the CMS fail with a
 * clear message. A dependency outage is a 503 the client can retry, never a 500.
 */
describe('Writes while Postgres is down (e2e)', () => {
  let app: INestApplication<App>;
  let outage: INestApplication<App>;
  let relay: DatabaseRelay;
  let restaurant: Restaurant;
  let owner: AdminClient;
  let diner: DinerClient;
  const ip = clientIp();

  const like = (client: DinerClient = new DinerClient(outage)) =>
    client.send(
      'put',
      `/branches/${restaurant.branchId}/dishes/${restaurant.dishId}/like`,
      { active: true },
    );

  const expectUnavailable = (response: { status: number; body: unknown }) => {
    expect(response.status).toBe(503);
    const body = errorResponseSchema.parse(response.body);
    expect(body.code).toBe('SERVICE_UNAVAILABLE');
    // Never the driver's text: it names hosts and ports.
    expect(body.message).not.toMatch(/ECONN|127\.0\.0\.1|connection|relay/i);
  };

  beforeAll(async () => {
    app = await createTestApp();
    await ensureSuperadmin();
    const superadmin = await login(
      app,
      SUPERADMIN.email,
      SUPERADMIN.password,
      ip,
    );
    restaurant = await publishedRestaurant(app, superadmin, ip);
    const registered = new DinerClient(app);
    await registered.register();

    // A second app, whose every context reaches Postgres only through the relay.
    relay = await DatabaseRelay.start({
      host: '127.0.0.1',
      port: Number(process.env.DB_PORT),
    });
    outage = await createTestApp({
      configure: (config) => ({
        ...config,
        database: { ...config.database, host: '127.0.0.1', port: relay.port },
      }),
    });
    // Sessions live in Postgres, so the same cookies work in the second app.
    owner = new AdminClient(outage, restaurant.owner.cookieHeader, ip);
    diner = Object.assign(new DinerClient(outage), {
      cookie: registered.cookie,
    });
  });

  afterAll(async () => {
    await relay.restore().catch(() => undefined);
    await outage.close();
    await relay.cut();
    await app.close();
  });

  it('answers 503 SERVICE_UNAVAILABLE, without internals, to likes, comments, the CMS and the login', async () => {
    await like().expect(200);
    await relay.cut();
    try {
      expectUnavailable(await like());
      expectUnavailable(
        await diner.send('post', '/comments', {
          branchId: restaurant.branchId,
          dishId: restaurant.dishId,
          text: 'Muy rico',
          clientId: randomUUID(),
        }),
      );
      expectUnavailable(
        await owner.send(
          'post',
          `/admin/businesses/${restaurant.business.id}/categories`,
          { name: 'Postres' },
        ),
      );
      expectUnavailable(
        await request(outage.getHttpServer())
          .post('/admin/session')
          .set('Origin', ADMIN_ORIGIN)
          .set('X-Forwarded-For', ip)
          .send({
            email: restaurant.business.adminEmail,
            password: ADMIN_PASSWORD,
          }),
      );
    } finally {
      await relay.restore();
    }
  });

  it('serves the writes again on its own once Postgres is back', async () => {
    await relay.cut();
    expectUnavailable(await like());
    await relay.restore();
    await like(diner).expect(200);
  });
});
