import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { metricsSchema } from '@miramenu/contracts';
import type { Queue } from 'bullmq';
import type { App } from 'supertest/types';
import { ConfigModule } from '../src/infrastructure/config/config.module';
import { DatabaseModule } from '../src/infrastructure/database/database.module';
import type { EntryBatchJob } from '../src/modules/measurement/application/entry-batch-job';
import { MeasurementWorkerModule } from '../src/modules/measurement';
import {
  asOwner,
  clientIp,
  ensureSuperadmin,
  login,
  SUPERADMIN,
} from './support/admin-fixtures';
import {
  publishedRestaurant,
  type Restaurant,
} from './support/interaction-fixtures';
import {
  aggregateOf,
  drained,
  feedEntry,
  hourOf,
  measurementPrefix,
  measurementQueue,
  sendBatch,
  storedEntries,
  withMeasurementQueue,
} from './support/measurement-fixtures';
import { createTestWorker, eventually } from './support/media-fixtures';
import { createTestApp } from './support/test-app';

jest.setTimeout(90_000);

describe('Measurement worker (e2e)', () => {
  const configure = withMeasurementQueue(measurementPrefix());
  let app: INestApplication<App>;
  let worker: TestingModule;
  let queue: Queue<EntryBatchJob>;
  let restaurant: Restaurant;
  let other: Restaurant;

  /** Entries an hour ago, so nothing else of this test lands in that hour. */
  const inHour = (offsetHours: number) =>
    new Date(Date.now() - offsetHours * 3_600_000).toISOString();

  beforeAll(async () => {
    app = await createTestApp({ configure });
    worker = await createTestWorker(configure, [
      ConfigModule,
      DatabaseModule,
      MeasurementWorkerModule,
    ]);
    queue = measurementQueue(app);
    await ensureSuperadmin();
    const ip = clientIp();
    const superadmin = await login(
      app,
      SUPERADMIN.email,
      SUPERADMIN.password,
      ip,
    );
    restaurant = await publishedRestaurant(app, superadmin, ip);
    other = await publishedRestaurant(app, superadmin, ip);
  });

  afterAll(async () => {
    await worker.close();
    await queue.obliterate({ force: true });
    await app.close();
  });

  it('saves a batch and adds it to the hour it happened in', async () => {
    const enteredAt = inHour(1);
    const entries = [
      feedEntry(restaurant.branchId, restaurant.dishId, { enteredAt }),
      feedEntry(restaurant.branchId, restaurant.dishId, {
        enteredAt,
        exit: 'manual',
        exposureMs: 800,
        validView: false,
      }),
      // Short, but the feed moved on by itself: never a quick skip (design).
      feedEntry(restaurant.branchId, restaurant.dishId, {
        enteredAt,
        exit: 'auto',
        exposureMs: 700,
        validView: false,
      }),
      feedEntry(restaurant.branchId, restaurant.dishId, {
        enteredAt,
        exit: 'abandoned',
        exposureMs: 1500,
        validView: true,
      }),
    ];

    await sendBatch(app, entries).expect(202);
    await drained(queue);

    expect(
      await aggregateOf(
        restaurant.branchId,
        restaurant.dishId,
        hourOf(enteredAt),
      ),
    ).toEqual({ entries: 4, views: 2, exposure_ms: '5500', quick_skips: 1 });
    const stored = await storedEntries(entries.map((entry) => entry.entryId));
    expect(stored.filter((row) => row.quick_skip)).toHaveLength(1);

    const metrics = await restaurant.owner
      .send(
        'get',
        `/admin/branches/${restaurant.branchId}/metrics?from=${hourOf(enteredAt).toISOString()}&to=${new Date(hourOf(enteredAt).getTime() + 3_600_000).toISOString()}`,
      )
      .expect(200);
    expect(metricsSchema.parse(metrics.body).totals).toMatchObject({
      entries: 4,
      views: 2,
      exposureMs: 5500,
      quickSkips: 1,
      exposureAverageMs: 2750,
      quickSkipRate: 0.25,
    });
  });

  it('counts a resent batch once, even with two workers taking the copies', async () => {
    const second = await createTestWorker(configure, [
      ConfigModule,
      DatabaseModule,
      MeasurementWorkerModule,
    ]);
    try {
      const enteredAt = inHour(2);
      const entries = [1, 2, 3].map(() =>
        feedEntry(restaurant.branchId, restaurant.dishId, { enteredAt }),
      );

      await Promise.all(
        [1, 2, 3, 4].map(() => sendBatch(app, entries).expect(202)),
      );
      await drained(queue);

      expect(
        await aggregateOf(
          restaurant.branchId,
          restaurant.dishId,
          hourOf(enteredAt),
        ),
      ).toEqual({ entries: 3, views: 3, exposure_ms: '12000', quick_skips: 0 });
    } finally {
      await second.close();
    }
  });

  it("drops entries of dishes not on the branch's menu (ADR-0022)", async () => {
    const enteredAt = inHour(3);
    const hidden = feedEntry(restaurant.branchId, restaurant.hiddenDishId, {
      enteredAt,
    });
    const foreign = feedEntry(restaurant.branchId, other.dishId, { enteredAt });
    const unknownBranch = feedEntry(randomUUID(), restaurant.dishId, {
      enteredAt,
    });

    await sendBatch(app, [hidden, foreign, unknownBranch]).expect(202);
    await drained(queue);

    expect(
      await storedEntries([
        hidden.entryId,
        foreign.entryId,
        unknownBranch.entryId,
      ]),
    ).toEqual([]);
    expect(
      await aggregateOf(restaurant.branchId, other.dishId, hourOf(enteredAt)),
    ).toBeNull();
  });

  it('adds a late entry to its own hour (design: hasta 7 días)', async () => {
    const enteredAt = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString();

    await sendBatch(app, [
      feedEntry(restaurant.branchId, restaurant.dishId, { enteredAt }),
    ]).expect(202);
    await drained(queue);

    expect(
      await aggregateOf(
        restaurant.branchId,
        restaurant.dishId,
        hourOf(enteredAt),
      ),
    ).toMatchObject({ entries: 1 });
  });

  it('keeps nothing of a batch whose aggregate fails, so its retry counts it once (ADR-0013)', async () => {
    const { branchId, dishId } = restaurant;
    const enteredAt = inHour(5);
    const hour = hourOf(enteredAt);
    const setEntries = (entries: number) =>
      asOwner((client) =>
        client.query(
          `INSERT INTO measurement.hourly_aggregate
             (branch_id, dish_id, hour, entries, views, exposure_ms, quick_skips)
           VALUES ($1, $2, $3, $4, 0, 0, 0)
           ON CONFLICT (branch_id, dish_id, hour) DO UPDATE SET entries = EXCLUDED.entries`,
          [branchId, dishId, hour, entries],
        ),
      );
    // A full counter makes the worker's addition overflow halfway through the batch.
    await setEntries(2_147_483_647);
    const entries = [1, 2].map(() =>
      feedEntry(branchId, dishId, { enteredAt }),
    );
    const ids = entries.map((entry) => entry.entryId);

    await sendBatch(app, entries).expect(202);
    await eventually(async () => {
      const waiting = await queue.getDelayed();
      return waiting.find((job) => job.data.entries[0]?.entryId === ids[0]);
    });
    // The failed attempt left no entry behind: they went down with the aggregate.
    expect(await storedEntries(ids)).toEqual([]);

    await setEntries(0);
    await drained(queue);

    expect(await storedEntries(ids)).toHaveLength(2);
    expect(await aggregateOf(branchId, dishId, hour)).toEqual({
      entries: 2,
      views: 2,
      exposure_ms: '8000',
      quick_skips: 0,
    });
  });

  it('sets apart a batch that fails 3 times, and the rest go on', async () => {
    // Only a broken job can get here: the API never queues an invalid entry.
    const broken = await queue.add(
      'record',
      {
        deviceId: randomUUID(),
        receivedAt: new Date().toISOString(),
        entries: [
          {
            ...feedEntry(restaurant.branchId, restaurant.dishId),
            enteredAt: 'not a date',
            quickSkip: false,
          },
        ],
      },
      {
        attempts: 3,
        backoff: { type: 'fixed', delay: 10 },
        removeOnFail: false,
      },
    );
    const enteredAt = inHour(4);
    await sendBatch(app, [
      feedEntry(restaurant.branchId, restaurant.dishId, { enteredAt }),
    ]).expect(202);
    await drained(queue);

    const failed = await queue.getJob(broken.id ?? '');
    expect(failed?.attemptsMade).toBe(3);
    expect(await failed?.isFailed()).toBe(true);
    expect(
      await aggregateOf(
        restaurant.branchId,
        restaurant.dishId,
        hourOf(enteredAt),
      ),
    ).toMatchObject({ entries: 1 });
  });
});
