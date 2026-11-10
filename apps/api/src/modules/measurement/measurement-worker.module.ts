import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { CatalogWorkerModule } from '../catalog';
import { MEASUREMENT_QUEUE } from './application/entry-batch-job';
import { EntryRecorder } from './application/entry-recorder';
import { PartitionMaintenance } from './application/partition-maintenance';
import { EntryBatchProcessor } from './worker/entry-batch.processor';
import { PartitionMaintenanceRunner } from './worker/partition-maintenance.runner';

/**
 * The worker's part of Measurement: saving and aggregating the queued batches, and
 * keeping the daily partitions. Catalog's worker module lends it the menu check.
 */
@Module({
  imports: [
    QueueModule,
    BullModule.registerQueue({ name: MEASUREMENT_QUEUE }),
    CatalogWorkerModule,
  ],
  providers: [
    EntryRecorder,
    EntryBatchProcessor,
    PartitionMaintenance,
    PartitionMaintenanceRunner,
  ],
})
export class MeasurementWorkerModule {}
