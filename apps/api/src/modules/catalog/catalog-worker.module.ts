import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { FfmpegModule } from '../../infrastructure/ffmpeg/ffmpeg.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { MediaReadyService } from './application/media-ready.service';
import { MEDIA_QUEUE } from './application/media-queue';
import { MenuDishes } from './application/menu-dishes';
import { PublishedMenuService } from './application/published-menu.service';
import { MediaOptimizer } from './worker/media-optimizer';
import { MediaProcessor } from './worker/media.processor';

/**
 * Catalog's media worker, run as its own process from the same code (npm run start:worker):
 * it only consumes the media queue and serves no HTTP.
 */
@Module({
  imports: [
    RedisModule,
    StorageModule,
    FfmpegModule,
    QueueModule,
    BullModule.registerQueue({ name: MEDIA_QUEUE }),
  ],
  providers: [
    MediaProcessor,
    MediaOptimizer,
    MediaReadyService,
    PublishedMenuService,
    MenuDishes,
  ],
  // The measurement worker checks dishes against the menu (ADR-0022).
  exports: [MenuDishes],
})
export class CatalogWorkerModule {}
