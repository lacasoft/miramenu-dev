import { setTimeout as delay } from 'node:timers/promises';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { BatchReceipt } from '@miramenu/contracts';
import type { Queue } from 'bullmq';
import { APP_CONFIG } from '../../../infrastructure/config/config.module';
import type { AppConfig } from '../../../infrastructure/config/environment';
import { judgeBatch } from '../domain/entry-rules';
import {
  ENTRY_BATCH_ATTEMPTS,
  type EntryBatchJob,
  MEASUREMENT_QUEUE,
  toJob,
} from './entry-batch-job';
import { measurementUnavailable, queueFull } from './errors';

/**
 * The queue client waits and retries while Redis is down, which suits the worker; a
 * request must not, so enqueueing gives up after this and the PWA keeps the batch.
 */
const ENQUEUE_TIMEOUT_MS = 2000;

/**
 * Receives batches of feed entries (ADR-0004): checks each entry, queues the good ones
 * and answers at once; saving them is the worker's job. Past the queue's cap, or without
 * Redis, the batch is refused so the PWA keeps it (design, flujo de medición, paso 3).
 */
@Injectable()
export class EntryIntake {
  private readonly maxBatches: number;

  constructor(
    @InjectQueue(MEASUREMENT_QUEUE)
    private readonly queue: Queue<EntryBatchJob>,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.maxBatches = config.measurement.queueMaxBatches;
  }

  async receive(
    batch: { deviceId: string; entries: readonly unknown[] },
    receivedAt: Date,
  ): Promise<BatchReceipt> {
    const { accepted, receipt } = judgeBatch(batch.entries, receivedAt);
    if (accepted.length > 0)
      await this.enqueue(toJob(batch.deviceId, receivedAt, accepted));
    return receipt;
  }

  private async enqueue(job: EntryBatchJob): Promise<void> {
    const attempt = async (): Promise<'queued' | 'full'> => {
      if ((await this.queue.count()) >= this.maxBatches) return 'full';
      await this.queue.add('record', job, {
        attempts: ENTRY_BATCH_ATTEMPTS,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: false,
      });
      return 'queued';
    };
    const pending = attempt();
    // After a timeout nobody awaits it, and a late failure must not go unhandled.
    pending.catch(() => undefined);
    let outcome: 'queued' | 'full' | 'timeout';
    try {
      outcome = await Promise.race([
        pending,
        delay(ENQUEUE_TIMEOUT_MS, 'timeout' as const, { ref: false }),
      ]);
    } catch {
      throw measurementUnavailable();
    }
    // A timed-out add may still land later: the worker counts each entry once anyway.
    if (outcome === 'timeout') throw measurementUnavailable();
    if (outcome === 'full') throw queueFull();
  }
}
