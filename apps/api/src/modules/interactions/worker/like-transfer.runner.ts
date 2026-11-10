import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { APP_CONFIG } from '../../../infrastructure/config/config.module';
import type { AppConfig } from '../../../infrastructure/config/environment';
import { LikeTransfer } from '../application/like-transfer';

/**
 * Runs the like transfer every LIKE_TRANSFER_INTERVAL_SECONDS in the worker process.
 * Rounds never overlap; a failed round is logged and the next one retries, because the
 * cursor only moves when a notice was applied.
 */
@Injectable()
export class LikeTransferRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(LikeTransferRunner.name);
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | undefined;
  private round: Promise<void> | null = null;

  constructor(
    private readonly transfer: LikeTransfer,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.intervalMs = config.interactions.likeTransferIntervalSeconds * 1000;
  }

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.round;
  }

  /** One round, unless the previous one is still going. */
  tick(): Promise<void> {
    this.round ??= this.run().finally(() => {
      this.round = null;
    });
    return this.round;
  }

  private async run(): Promise<void> {
    try {
      const applied = await this.transfer.processPending();
      if (applied > 0)
        this.logger.log(`Moved the likes of ${applied} registered device(s)`);
    } catch (error) {
      this.logger.warn(
        `Like transfer failed; it retries next round: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
