import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

export const MEDIA_QUEUE = 'catalog-media';

export interface MediaJob {
  mediaId: string;
}

/** Attempts per medium before it is marked failed and its job stays in the failed list. */
export const MEDIA_JOB_ATTEMPTS = 3;

/**
 * The media optimization queue (ADR-0006). The job id is the medium's id, so confirming an
 * upload twice never queues it twice while its job is still known.
 */
@Injectable()
export class MediaQueue {
  constructor(
    @InjectQueue(MEDIA_QUEUE) private readonly queue: Queue<MediaJob>,
  ) {}

  async enqueue(mediaId: string): Promise<void> {
    await this.queue.add(
      'optimize',
      { mediaId },
      {
        jobId: mediaId,
        attempts: MEDIA_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: false,
      },
    );
  }
}
