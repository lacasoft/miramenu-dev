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
  type CreatedMedia,
  createMediaRequestSchema,
  type Media,
  mediaPageQuerySchema,
  type Page,
} from '@miramenu/contracts';
import { z } from 'zod';
import {
  type Actor,
  AdminSessionGuard,
  CurrentActor,
} from '../../business-access';
import { MediaService } from '../application/media.service';

/**
 * Media uploads (ADR-0038): the business uploads its own and each branch its own, under
 * their routes, so every check is on the scope in the path.
 */
@Controller('admin')
@UseGuards(AdminSessionGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('businesses/:businessId/media')
  createForBusiness(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Body({ schema: createMediaRequestSchema })
    body: z.infer<typeof createMediaRequestSchema>,
  ): Promise<CreatedMedia> {
    return this.media.create(actor, { businessId }, body);
  }

  @Post('businesses/:businessId/media/:mediaId/complete')
  @HttpCode(200)
  completeForBusiness(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Param('mediaId', { schema: z.uuid() }) mediaId: string,
  ): Promise<Media> {
    return this.media.complete(actor, { businessId }, mediaId);
  }

  @Get('businesses/:businessId/media')
  listForBusiness(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Query({ schema: mediaPageQuerySchema })
    query: z.infer<typeof mediaPageQuerySchema>,
  ): Promise<Page<Media>> {
    return this.media.list(actor, { businessId }, query);
  }

  @Post('branches/:branchId/media')
  createForBranch(
    @CurrentActor() actor: Actor,
    @Param('branchId', { schema: z.uuid() }) branchId: string,
    @Body({ schema: createMediaRequestSchema })
    body: z.infer<typeof createMediaRequestSchema>,
  ): Promise<CreatedMedia> {
    return this.media.create(actor, { branchId }, body);
  }

  @Post('branches/:branchId/media/:mediaId/complete')
  @HttpCode(200)
  completeForBranch(
    @CurrentActor() actor: Actor,
    @Param('branchId', { schema: z.uuid() }) branchId: string,
    @Param('mediaId', { schema: z.uuid() }) mediaId: string,
  ): Promise<Media> {
    return this.media.complete(actor, { branchId }, mediaId);
  }

  @Get('branches/:branchId/media')
  listForBranch(
    @CurrentActor() actor: Actor,
    @Param('branchId', { schema: z.uuid() }) branchId: string,
    @Query({ schema: mediaPageQuerySchema })
    query: z.infer<typeof mediaPageQuerySchema>,
  ): Promise<Page<Media>> {
    return this.media.list(actor, { branchId }, query);
  }
}
