import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job } from 'bullmq';
import { APP_CONFIG } from '../../../infrastructure/config/config.module';
import type { AppConfig } from '../../../infrastructure/config/environment';
import {
  type EntryBatchJob,
  MEASUREMENT_QUEUE,
} from '../application/entry-batch-job';
import { EntryRecorder } from '../application/entry-recorder';

/**
 * The measurement worker (ADR-0004): each batch is saved and aggregated in one
 * transaction, and its job completes only after the commit, so a crash before it means
 * another round, never a double count. A batch failing 3 times stays in the failed list
 * (design: "cola de errores") and the rest go on. Logs never carry device ids.
 */
@Processor(MEASUREMENT_QUEUE)
export class EntryBatchProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger('MeasurementWorker');

  constructor(
    private readonly recorder: EntryRecorder,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    this.worker.concurrency = this.config.measurement.workerConcurrency;
  }

  process(
    job: Job<EntryBatchJob>,
  ): Promise<{ recorded: number; discarded: number }> {
    return this.recorder.record(job.data);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<EntryBatchJob> | undefined, error: Error): void {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    this.logger.warn(
      job.attemptsMade < attempts
        ? `Batch ${job.id} attempt ${job.attemptsMade} failed: ${error.message}`
        : `Batch ${job.id} set apart after ${attempts} attempts: ${error.message}`,
    );
  }
}
