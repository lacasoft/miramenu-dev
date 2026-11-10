import { Module } from '@nestjs/common';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { BusinessAccessModule } from '../business-access';
import { CatalogModule } from '../catalog';
import { DinersModule } from '../diners';
import { CommentLimits } from './application/comment-limits';
import { CommentsService } from './application/comments.service';
import { InteractionCounts } from './application/interaction-counts';
import { LikesService } from './application/likes.service';
import { ModerationService } from './application/moderation.service';
import { CommentsController } from './http/comments.controller';
import { LikesController } from './http/likes.controller';
import { ModerationController } from './http/moderation.controller';

/**
 * Interactions: likes, comments and their moderation (ADR-0008, ADR-0040). It uses
 * Catalog (dishes on a menu), Diners (who the diner is, public names) and Business &
 * access (who may moderate), each only through its index.
 */
@Module({
  imports: [RedisModule, BusinessAccessModule, CatalogModule, DinersModule],
  controllers: [LikesController, CommentsController, ModerationController],
  providers: [
    LikesService,
    InteractionCounts,
    CommentsService,
    CommentLimits,
    ModerationService,
  ],
  // Contract "Conteos por platillo y sucursal", for Measurement's dashboard.
  exports: [InteractionCounts],
})
export class InteractionsModule {}
