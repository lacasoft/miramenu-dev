import { Module } from '@nestjs/common';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { BusinessAccessModule } from '../business-access';
import { BaseMenuService } from './application/base-menu.service';
import { BranchMenuService } from './application/branch-menu.service';
import { DraftState } from './application/draft-state';
import { PublicationService } from './application/publication.service';
import { PublishedMenuService } from './application/published-menu.service';
import { BaseMenuController } from './http/base-menu.controller';
import { BranchMenuController } from './http/branch-menu.controller';
import { PublicMenuController } from './http/public-menu.controller';
import { PublicationController } from './http/publication.controller';

/** Catalog: menu drafts, publication and the published menu diners read (ADR-0003, ADR-0036). */
@Module({
  imports: [RedisModule, BusinessAccessModule],
  controllers: [
    BaseMenuController,
    BranchMenuController,
    PublicationController,
    PublicMenuController,
  ],
  providers: [
    DraftState,
    BaseMenuService,
    BranchMenuService,
    PublicationService,
    PublishedMenuService,
  ],
})
export class CatalogModule {}
