import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  type Publication,
  publishBranchMenuRequestSchema,
  publishBusinessMenuRequestSchema,
} from '@miramenu/contracts';
import { z } from 'zod';
import { IdempotencyKey } from '../../../infrastructure/http/idempotency-key';
import {
  type Actor,
  AdminSessionGuard,
  CurrentActor,
} from '../../business-access';
import { PublicationService } from '../application/publication.service';

/** Publishing makes a draft visible to diners (design: "Publicar"). */
@Controller('admin')
@UseGuards(AdminSessionGuard)
export class PublicationController {
  constructor(private readonly publications: PublicationService) {}

  @Post('businesses/:businessId/publications')
  publishBusiness(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @IdempotencyKey() idempotencyKey: string,
    @Body({ schema: publishBusinessMenuRequestSchema })
    body: z.infer<typeof publishBusinessMenuRequestSchema>,
  ): Promise<Publication> {
    return this.publications.publishBusiness(
      actor,
      businessId,
      idempotencyKey,
      body,
    );
  }

  @Post('branches/:branchId/publications')
  publishBranch(
    @CurrentActor() actor: Actor,
    @Param('branchId', { schema: z.uuid() }) branchId: string,
    @IdempotencyKey() idempotencyKey: string,
    @Body({ schema: publishBranchMenuRequestSchema })
    body: z.infer<typeof publishBranchMenuRequestSchema>,
  ): Promise<Publication> {
    return this.publications.publishBranch(
      actor,
      branchId,
      idempotencyKey,
      body,
    );
  }
}
