import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  batchReceiptSchema,
  errorResponseSchema,
  FEED_ENTRY_LIMITS,
} from '@miramenu/contracts';
import type { Queue } from 'bullmq';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { EntryBatchJob } from '../src/modules/measurement/application/entry-batch-job';
import {
  feedEntry,
  measurementPrefix,
  measurementQueue,
  sendBatch,
  withMeasurementQueue,
} from './support/measurement-fixtures';
import { createTestApp } from './support/test-app';

const codeOf = (body: unknown) => errorResponseSchema.parse(body).code;
// Port 1 is never open locally or in CI, so connections are refused at once.
const UNREACHABLE_PORT = 1;
const branchId = randomUUID();
const dishId = randomUUID();

describe('Feed entry intake (e2e)', () => {
  // No worker here: the batches wait in the queue, where the tests read them.
  const prefix = measurementPrefix();
  let app: INestApplication<App>;
  let queue: Queue<EntryBatchJob>;

  const queuedEntryIds = async () =>
    (await queue.getJobs(['waiting'])).flatMap((job) =>
      job.data.entries.map((entry) => entry.entryId),
    );

  beforeAll(async () => {
    app = await createTestApp({ configure: withMeasurementQueue(prefix) });
    queue = measurementQueue(app);
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await app.close();
  });

  it('answers each entry and queues the accepted ones with what the server derives', async () => {
    const quick = feedEntry(branchId, dishId, {
      exit: 'manual',
      exposureMs: 900,
      validView: false,
    });
    const auto = feedEntry(branchId, dishId);
    const deviceId = randomUUID();

    const response = await sendBatch(app, [quick, auto], { deviceId }).expect(
      202,
    );

    expect(response.headers['cache-control']).toBe('no-store');
    expect(batchReceiptSchema.parse(response.body)).toEqual({
      accepted: [quick.entryId, auto.entryId],
      rejected: [],
    });
    const [job] = (await queue.getJobs(['waiting'])).filter((candidate) =>
      candidate.data.entries.some((entry) => entry.entryId === quick.entryId),
    );
    expect(job.data.deviceId).toBe(deviceId);
    expect(job.data.entries).toEqual([
      expect.objectContaining({ entryId: quick.entryId, quickSkip: true }),
      expect.objectContaining({ entryId: auto.entryId, quickSkip: false }),
    ]);
    expect(job.opts.attempts).toBe(3);
  });

  it('takes the same batch as sendBeacon sends it: text/plain holding JSON', async () => {
    const entry = feedEntry(branchId, dishId);

    const response = await sendBatch(app, [entry], { asBeacon: true }).expect(
      202,
    );

    expect(batchReceiptSchema.parse(response.body).accepted).toEqual([
      entry.entryId,
    ]);
    expect(await queuedEntryIds()).toContain(entry.entryId);
  });

  it('rejects invalid, late, future and repeated entries, and queues nothing if none is left', async () => {
    const valid = feedEntry(branchId, dishId);
    const late = feedEntry(branchId, dishId, {
      enteredAt: new Date(Date.now() - 8 * 24 * 3_600_000).toISOString(),
    });
    const future = feedEntry(branchId, dishId, {
      enteredAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    const before = (await queuedEntryIds()).length;

    const response = await sendBatch(app, [
      late,
      future,
      { ...valid, exposureMs: 500 },
      valid,
      valid,
    ]).expect(202);

    expect(batchReceiptSchema.parse(response.body)).toEqual({
      accepted: [valid.entryId],
      rejected: [
        { index: 0, entryId: late.entryId, reason: 'too_late' },
        { index: 1, entryId: future.entryId, reason: 'in_future' },
        { index: 2, entryId: valid.entryId, reason: 'invalid' },
        { index: 4, entryId: valid.entryId, reason: 'repeated_in_batch' },
      ],
    });
    expect((await queuedEntryIds()).length).toBe(before + 1);

    await sendBatch(app, [late]).expect(202, {
      accepted: [],
      rejected: [{ index: 0, entryId: late.entryId, reason: 'too_late' }],
    });
    expect((await queuedEntryIds()).length).toBe(before + 1);
  });

  it('refuses a batch that is not one: too long, without a device or not JSON', async () => {
    const tooLong = Array.from(
      { length: FEED_ENTRY_LIMITS.entriesPerBatch + 1 },
      () => feedEntry(branchId, dishId),
    );
    for (const call of [
      sendBatch(app, tooLong),
      request(app.getHttpServer())
        .post('/feed-entries/batch')
        .send({ entries: [feedEntry(branchId, dishId)] }),
      request(app.getHttpServer())
        .post('/feed-entries/batch')
        .set('Content-Type', 'text/plain')
        .send('{not json'),
    ]) {
      const response = await call.expect(400);
      expect(codeOf(response.body)).toBe('VALIDATION_FAILED');
    }
  });

  it('refuses batches once the queue passes its cap, so the PWA keeps them', async () => {
    const capped = await createTestApp({
      configure: (config) => ({
        ...withMeasurementQueue(measurementPrefix())(config),
        measurement: { ...config.measurement, queueMaxBatches: 1 },
      }),
    });
    try {
      await sendBatch(capped, [feedEntry(branchId, dishId)]).expect(202);

      const response = await sendBatch(capped, [
        feedEntry(branchId, dishId),
      ]).expect(503);
      expect(codeOf(response.body)).toBe('MEASUREMENT_QUEUE_FULL');
      expect(response.headers['retry-after']).toBe('60');
    } finally {
      await measurementQueue(capped).obliterate({ force: true });
      await capped.close();
    }
  });

  it('refuses batches when Redis does not answer, within a couple of seconds', async () => {
    const noRedis = await createTestApp({
      configure: (config) => ({
        ...withMeasurementQueue(measurementPrefix())(config),
        redis: { ...config.redis, port: UNREACHABLE_PORT },
      }),
    });
    try {
      const startedAt = Date.now();
      const response = await sendBatch(noRedis, [
        feedEntry(branchId, dishId),
      ]).expect(503);
      expect(codeOf(response.body)).toBe('MEASUREMENT_UNAVAILABLE');
      expect(Date.now() - startedAt).toBeLessThan(4000);
    } finally {
      await noRedis.close();
    }
  });
});
