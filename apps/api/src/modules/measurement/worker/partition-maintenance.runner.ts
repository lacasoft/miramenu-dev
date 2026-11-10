import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PartitionMaintenance } from '../application/partition-maintenance';

/** Hourly: partitions are kept a week ahead, so a few missed rounds lose nothing. */
const INTERVAL_MS = 60 * 60 * 1000;

/**
 * Keeps the daily partitions from the worker: once when it starts, then every hour.
 * Rounds never overlap; a failure is logged and the next round tries again, and
 * /health/dependencies names it if tomorrow's partition ever goes missing.
 */
@Injectable()
export class PartitionMaintenanceRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(PartitionMaintenanceRunner.name);
  private timer: NodeJS.Timeout | undefined;
  private round: Promise<void> | null = null;

  constructor(private readonly maintenance: PartitionMaintenance) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.tick();
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.round;
  }

  tick(): Promise<void> {
    this.round ??= this.run().finally(() => {
      this.round = null;
    });
    return this.round;
  }

  private async run(): Promise<void> {
    try {
      await this.maintenance.run();
    } catch (error) {
      this.logger.warn(
        `Partition maintenance failed; it retries next round: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
