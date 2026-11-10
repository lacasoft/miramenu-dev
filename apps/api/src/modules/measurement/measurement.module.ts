import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { BusinessAccessModule } from '../business-access';
import { InteractionsModule } from '../interactions';
import { MEASUREMENT_QUEUE } from './application/entry-batch-job';
import { EntryIntake } from './application/entry-intake';
import { MetricsService } from './application/metrics.service';
import { FeedEntriesController } from './http/feed-entries.controller';
import { MetricsController } from './http/metrics.controller';

/**
 * Measurement (ADR-0004, ADR-0041): the API only receives and queues feed entries, and
 * answers the dashboard; MeasurementWorkerModule saves and aggregates them.
 */
@Module({
  imports: [
    QueueModule,
    BullModule.registerQueue({ name: MEASUREMENT_QUEUE }),
    BusinessAccessModule,
    InteractionsModule,
  ],
  controllers: [FeedEntriesController, MetricsController],
  providers: [EntryIntake, MetricsService],
})
export class MeasurementModule {}
