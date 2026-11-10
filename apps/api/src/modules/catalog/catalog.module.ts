import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { BusinessAccessModule } from '../business-access';
import { BaseMenuService } from './application/base-menu.service';
import { BranchMenuService } from './application/branch-menu.service';
import { DraftState } from './application/draft-state';
import { MediaQueue, MEDIA_QUEUE } from './application/media-queue';
import { MediaService } from './application/media.service';
import { MenuDishes } from './application/menu-dishes';
import { PublicationService } from './application/publication.service';
import { PublishedMenuService } from './application/published-menu.service';
import { BaseMenuController } from './http/base-menu.controller';
import { BranchMenuController } from './http/branch-menu.controller';
import { MediaController } from './http/media.controller';
import { PublicMenuController } from './http/public-menu.controller';
import { PublicationController } from './http/publication.controller';

/**
 * Catalog: menu drafts, media, publication and the published menu diners read (ADR-0003,
 * ADR-0036, ADR-0038). The API only queues media work; CatalogWorkerModule does it.
 */
@Module({
  imports: [
    RedisModule,
    StorageModule,
    QueueModule,
    BullModule.registerQueue({ name: MEDIA_QUEUE }),
    BusinessAccessModule,
  ],
  controllers: [
    BaseMenuController,
    BranchMenuController,
    MediaController,
    PublicationController,
    PublicMenuController,
  ],
  providers: [
    DraftState,
    BaseMenuService,
    BranchMenuService,
    MediaService,
    MediaQueue,
    MenuDishes,
    PublicationService,
    PublishedMenuService,
  ],
  // Contract "Confirmar que un platillo está en una sucursal" (design).
  exports: [MenuDishes],
})
export class CatalogModule {}
