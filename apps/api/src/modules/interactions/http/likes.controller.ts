import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  type BranchInteractions,
  type LikeState,
  likeRequestSchema,
  type MyLikes,
} from '@miramenu/contracts';
import { z } from 'zod';
import { PublicSiteOriginGuard } from '../../../infrastructure/http/public-site-origin.guard';
import {
  CurrentDiner,
  DinerIdentityGuard,
  type IdentifiedDiner,
} from '../../diners';
import { InteractionCounts } from '../application/interaction-counts';
import { LikesService } from '../application/likes.service';

/** Likes and counts of a branch's dishes, for the PWA. */
@Controller('branches/:branchId')
export class LikesController {
  constructor(
    private readonly likes: LikesService,
    private readonly counts: InteractionCounts,
  ) {}

  @Put('dishes/:dishId/like')
  @UseGuards(PublicSiteOriginGuard, DinerIdentityGuard)
  @Header('Cache-Control', 'no-store')
  set(
    @Param('branchId', { schema: z.uuid() }) branchId: string,
    @Param('dishId', { schema: z.uuid() }) dishId: string,
    @Body({ schema: likeRequestSchema })
    body: z.infer<typeof likeRequestSchema>,
    @CurrentDiner() identity: IdentifiedDiner,
  ): Promise<LikeState> {
    return this.likes.set(branchId, dishId, identity, body.active);
  }

  /** Shared by every diner and cached briefly: RNF-04 allows 30 s to see a new like. */
  @Get('interactions')
  @Header('Cache-Control', 'public, max-age=10')
  interactions(
    @Param('branchId', { schema: z.uuid() }) branchId: string,
  ): Promise<BranchInteractions> {
    return this.counts.forBranch(branchId);
  }

  @Get('likes/mine')
  @UseGuards(DinerIdentityGuard)
  @Header('Cache-Control', 'no-store')
  mine(
    @Param('branchId', { schema: z.uuid() }) branchId: string,
    @CurrentDiner() identity: IdentifiedDiner,
  ): Promise<MyLikes> {
    return this.likes.mine(branchId, identity);
  }
}
