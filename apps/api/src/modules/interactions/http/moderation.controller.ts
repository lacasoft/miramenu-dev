import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  moderateCommentSchema,
  type ModerationPage,
  moderationQuerySchema,
} from '@miramenu/contracts';
import { z } from 'zod';
import {
  type Actor,
  AdminSessionGuard,
  CurrentActor,
} from '../../business-access';
import { ModerationService } from '../application/moderation.service';

/** The moderation queue of a business or a branch, and the decision on each comment. */
@Controller('admin')
@UseGuards(AdminSessionGuard)
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('businesses/:businessId/moderation')
  ofBusiness(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Query({ schema: moderationQuerySchema })
    query: z.output<typeof moderationQuerySchema>,
  ): Promise<ModerationPage> {
    return this.moderation.pendingOfBusiness(
      actor,
      businessId,
      query,
      new Date(),
    );
  }

  @Get('branches/:branchId/moderation')
  ofBranch(
    @CurrentActor() actor: Actor,
    @Param('branchId', { schema: z.uuid() }) branchId: string,
    @Query({ schema: moderationQuerySchema })
    query: z.output<typeof moderationQuerySchema>,
  ): Promise<ModerationPage> {
    return this.moderation.pendingOfBranch(actor, branchId, query, new Date());
  }

  @Post('comments/:commentId/approve')
  @HttpCode(204)
  approve(
    @CurrentActor() actor: Actor,
    @Param('commentId', { schema: z.uuid() }) commentId: string,
    @Body({ schema: moderateCommentSchema })
    body: z.infer<typeof moderateCommentSchema>,
  ): Promise<void> {
    return this.moderation.decide(
      actor,
      commentId,
      body.version,
      'approved',
      new Date(),
    );
  }

  @Post('comments/:commentId/reject')
  @HttpCode(204)
  reject(
    @CurrentActor() actor: Actor,
    @Param('commentId', { schema: z.uuid() }) commentId: string,
    @Body({ schema: moderateCommentSchema })
    body: z.infer<typeof moderateCommentSchema>,
  ): Promise<void> {
    return this.moderation.decide(
      actor,
      commentId,
      body.version,
      'rejected',
      new Date(),
    );
  }
}
