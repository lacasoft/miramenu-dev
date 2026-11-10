import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { APP_CONFIG } from '../../../infrastructure/config/config.module';
import type { AppConfig } from '../../../infrastructure/config/environment';
import { MediaReadyService } from '../application/media-ready.service';
import { MEDIA_QUEUE, type MediaJob } from '../application/media-queue';
import { InvalidMediaError, MediaOptimizer } from './media-optimizer';

/**
 * The media worker (ADR-0006): optimizes each confirmed upload and tells Catalog it is
 * ready or failed. An unacceptable file fails at once; any other error is retried with
 * backoff, and once the attempts run out the medium is marked failed and its job stays in
 * the failed list. Logs name the medium, never its content.
 */
@Processor(MEDIA_QUEUE)
export class MediaProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger('MediaWorker');

  constructor(
    private readonly ready: MediaReadyService,
    private readonly optimizer: MediaOptimizer,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    this.worker.concurrency = this.config.media.workerConcurrency;
  }

  async process(job: Job<MediaJob>): Promise<void> {
    const media = await this.ready.processing(job.data.mediaId);
    // Already ready or failed: a retried or repeated job has nothing left to do.
    if (!media) return;
    try {
      const variants = await this.optimizer.optimize(media);
      await this.ready.markReady(media.id, variants);
      this.logger.log(`Medium ${media.id} ready`);
    } catch (error) {
      if (error instanceof InvalidMediaError) {
        await this.ready.markFailed(media.id, error.reason);
        this.logger.warn(`Medium ${media.id} refused: ${error.reason}`);
        throw new UnrecoverableError(error.reason);
      }
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<MediaJob> | undefined, error: Error): Promise<void> {
    if (!job || error instanceof UnrecoverableError) return;
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) {
      this.logger.warn(
        `Medium ${job.data.mediaId} attempt ${job.attemptsMade} failed: ${error.message}`,
      );
      return;
    }
    await this.ready.markFailed(job.data.mediaId, 'processing_error');
    this.logger.error(
      `Medium ${job.data.mediaId} failed after ${attempts} attempts`,
    );
  }
}
