import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import type { FeedEntry } from '@miramenu/contracts';
import type { Queue } from 'bullmq';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { AppConfig } from '../../src/infrastructure/config/environment';
import { MEASUREMENT_QUEUE } from '../../src/modules/measurement/application/entry-batch-job';
import { asOwner, unique } from './admin-fixtures';

/** Its own queue prefix, so no other test file's worker takes these batches. */
export const withMeasurementQueue =
  (prefix: string) => (config: AppConfig) => ({
    ...config,
    queue: { prefix },
  });
export const measurementPrefix = () => unique('e2e-measure');

/** A closed feed entry, as the PWA would send it; it started a minute ago by default. */
export function feedEntry(
  branchId: string,
  dishId: string,
  fields: Partial<FeedEntry> = {},
): FeedEntry {
  return {
    entryId: randomUUID(),
    branchId,
    dishId,
    enteredAt: new Date(Date.now() - 60_000).toISOString(),
    exposureMs: 4000,
    validView: true,
    exit: 'auto',
    ...fields,
  };
}

/** POSTs a batch as JSON, or as sendBeacon would: text/plain holding the JSON. */
export function sendBatch(
  app: INestApplication<App>,
  entries: unknown[],
  options: { deviceId?: string; asBeacon?: boolean } = {},
) {
  const body = { deviceId: options.deviceId ?? randomUUID(), entries };
  const call = request(app.getHttpServer()).post('/feed-entries/batch');
  return options.asBeacon
    ? call
        .set('Content-Type', 'text/plain;charset=UTF-8')
        .send(JSON.stringify(body))
    : call.send(body);
}

export const measurementQueue = (app: INestApplication<App>) =>
  app.get<Queue>(getQueueToken(MEASUREMENT_QUEUE));

/** Waits until every queued batch was processed (completed or failed for good). */
export async function drained(queue: Queue, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed');
    if (counts.waiting + counts.active + counts.delayed === 0) return;
    await sleep(100);
  }
  throw new Error('the measurement queue did not drain');
}

export interface AggregateRow {
  entries: number;
  views: number;
  exposure_ms: string;
  quick_skips: number;
}

export const aggregateOf = (branchId: string, dishId: string, hour: Date) =>
  asOwner(async (client) => {
    const result = await client.query<AggregateRow>(
      `SELECT entries, views, exposure_ms, quick_skips FROM measurement.hourly_aggregate
       WHERE branch_id = $1 AND dish_id = $2 AND hour = $3`,
      [branchId, dishId, hour],
    );
    return result.rows[0] ?? null;
  });

export const storedEntries = (entryIds: readonly string[]) =>
  asOwner(async (client) => {
    const result = await client.query<{
      entry_id: string;
      quick_skip: boolean;
    }>(
      `SELECT entry_id, quick_skip FROM measurement.feed_entry WHERE entry_id = ANY($1::uuid[])`,
      [entryIds],
    );
    return result.rows;
  });

export const hourOf = (instant: string | Date): Date => {
  const ms = new Date(instant).getTime();
  return new Date(ms - (ms % 3_600_000));
};
