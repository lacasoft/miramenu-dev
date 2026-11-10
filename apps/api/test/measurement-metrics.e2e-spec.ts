import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { errorResponseSchema, metricsSchema } from '@miramenu/contracts';
import type { App } from 'supertest/types';
import {
  activateAdmin,
  ADMIN_PASSWORD,
  type AdminClient,
  asOwner,
  clientIp,
  createBranch,
  ensureSuperadmin,
  login,
  SUPERADMIN,
  unique,
} from './support/admin-fixtures';
import {
  publishedRestaurant,
  type Restaurant,
} from './support/interaction-fixtures';
import { createTestApp } from './support/test-app';

const codeOf = (body: unknown) => errorResponseSchema.parse(body).code;
// Mexico City is UTC-6 all year: 2026-10-01 00:00 there is 06:00 UTC.
const PERIOD = '?from=2026-10-01T06:00:00Z&to=2026-10-03T06:00:00Z';

describe('Dashboard metrics (e2e)', () => {
  let app: INestApplication<App>;
  let restaurant: Restaurant;
  let secondBranch: string;
  let branchAdmin: AdminClient;

  const aggregate = (
    branchId: string,
    dishId: string,
    hour: string,
    [entries, views, exposureMs, quickSkips]: number[],
  ) =>
    asOwner((client) =>
      client.query(
        `INSERT INTO measurement.hourly_aggregate
           (branch_id, dish_id, hour, entries, views, exposure_ms, quick_skips)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [branchId, dishId, hour, entries, views, exposureMs, quickSkips],
      ),
    );

  beforeAll(async () => {
    app = await createTestApp();
    await ensureSuperadmin();
    const ip = clientIp();
    const superadmin = await login(
      app,
      SUPERADMIN.email,
      SUPERADMIN.password,
      ip,
    );
    restaurant = await publishedRestaurant(app, superadmin, ip);
    secondBranch = (
      await createBranch(restaurant.owner, restaurant.business.id)
    ).id;
    const { branchId, dishId, hiddenDishId } = restaurant;

    // Before the period: 23:00 of Sept 30 in Mexico City.
    await aggregate(branchId, dishId, '2026-10-01T05:00:00Z', [99, 99, 99, 0]);
    // Oct 1 local, the second one already Oct 2 in UTC.
    await aggregate(
      branchId,
      dishId,
      '2026-10-01T23:00:00Z',
      [10, 6, 30000, 2],
    );
    await aggregate(branchId, dishId, '2026-10-02T03:00:00Z', [5, 4, 10000, 1]);
    await aggregate(
      branchId,
      hiddenDishId,
      '2026-10-02T18:00:00Z',
      [3, 0, 0, 3],
    );
    await aggregate(
      secondBranch,
      dishId,
      '2026-10-02T18:00:00Z',
      [4, 2, 8000, 0],
    );
    await asOwner(async (client) => {
      for (const createdAt of [
        '2026-10-02T15:00:00Z',
        '2026-10-02T16:00:00Z',
      ]) {
        await client.query(
          `INSERT INTO interactions.dish_like (branch_id, dish_id, device_id, created_at)
           VALUES ($1, $2, $3, $4)`,
          [branchId, dishId, randomUUID(), createdAt],
        );
      }
      await client.query(
        `INSERT INTO interactions.comment (branch_id, dish_id, diner_id, client_id, text, status, submitted_at, approved_at)
         VALUES ($1, $2, $3, $4, 'Rico', 'approved', $5, $5)`,
        [branchId, dishId, randomUUID(), randomUUID(), '2026-10-01T20:00:00Z'],
      );
    });

    const email = `${unique('dashboard')}@example.test`;
    await restaurant.owner
      .send('post', `/admin/businesses/${restaurant.business.id}/users`, {
        email,
        name: 'Branch dashboard',
        role: { role: 'branch_admin', branchId },
      })
      .expect(201);
    await activateAdmin(email);
    branchAdmin = await login(app, email, ADMIN_PASSWORD, ip);
  });

  afterAll(async () => {
    await app.close();
  });

  it('adds up a branch: totals, local days and dishes, with likes and comments of the period', async () => {
    const response = await branchAdmin
      .send('get', `/admin/branches/${restaurant.branchId}/metrics${PERIOD}`)
      .expect(200);
    const metrics = metricsSchema.parse(response.body);

    expect(metrics.period).toEqual({
      from: '2026-10-01T06:00:00.000Z',
      to: '2026-10-03T06:00:00.000Z',
      timeZone: 'America/Mexico_City',
    });
    expect(metrics.totals).toEqual({
      entries: 18,
      views: 10,
      exposureMs: 40000,
      quickSkips: 6,
      likes: 2,
      comments: 1,
      exposureAverageMs: 4000,
      quickSkipRate: 6 / 18,
    });
    expect(metrics.byDay).toEqual([
      {
        day: '2026-10-01',
        entries: 15,
        views: 10,
        exposureMs: 40000,
        quickSkips: 3,
        likes: 0,
        comments: 1,
      },
      {
        day: '2026-10-02',
        entries: 3,
        views: 0,
        exposureMs: 0,
        quickSkips: 3,
        likes: 2,
        comments: 0,
      },
    ]);
    expect(metrics.byDish).toEqual([
      expect.objectContaining({
        dishId: restaurant.dishId,
        entries: 15,
        views: 10,
        exposureAverageMs: 4000,
        quickSkipRate: 0.2,
      }),
      // No view: its average exposure is unknown, never 0.
      expect.objectContaining({
        dishId: restaurant.hiddenDishId,
        entries: 3,
        views: 0,
        exposureAverageMs: null,
        quickSkipRate: 1,
      }),
    ]);
  });

  it('groups the business by adding its branches, for the business admin only', async () => {
    const response = await restaurant.owner
      .send(
        'get',
        `/admin/businesses/${restaurant.business.id}/metrics${PERIOD}`,
      )
      .expect(200);
    const metrics = metricsSchema.parse(response.body);
    expect(metrics.totals).toMatchObject({
      entries: 22,
      views: 12,
      exposureMs: 48000,
    });

    // design: the branch admin "ve solo el dashboard de su sucursal".
    const grouped = await branchAdmin
      .send(
        'get',
        `/admin/businesses/${restaurant.business.id}/metrics${PERIOD}`,
      )
      .expect(403);
    expect(codeOf(grouped.body)).toBe('FORBIDDEN');
    await branchAdmin
      .send('get', `/admin/branches/${secondBranch}/metrics${PERIOD}`)
      .expect(404);
  });

  it('reads the days in the time zone asked for', async () => {
    const response = await restaurant.owner
      .send(
        'get',
        `/admin/branches/${restaurant.branchId}/metrics${PERIOD}&timeZone=UTC`,
      )
      .expect(200);
    const days = metricsSchema
      .parse(response.body)
      .byDay.map((day) => [day.day, day.entries]);
    // In UTC the 03:00 hour of Oct 2 is no longer Oct 1.
    expect(days).toEqual([
      ['2026-10-01', 10],
      ['2026-10-02', 8],
    ]);
  });

  it('refuses a period that is not whole hours in order', async () => {
    for (const query of [
      '',
      '?from=2026-10-01T06:30:00Z&to=2026-10-03T06:00:00Z',
      '?from=2026-10-03T06:00:00Z&to=2026-10-01T06:00:00Z',
      `${PERIOD}&timeZone=Mars/Olympus`,
    ]) {
      const response = await restaurant.owner
        .send('get', `/admin/branches/${restaurant.branchId}/metrics${query}`)
        .expect(400);
      expect(codeOf(response.body)).toBe('VALIDATION_FAILED');
    }
  });
});
