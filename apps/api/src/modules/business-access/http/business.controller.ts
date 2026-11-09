import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type Business,
  type CreatedBusiness,
  createBusinessRequestSchema,
  type Page,
  pageQuerySchema,
  updateBusinessRequestSchema,
} from '@miramenu/contracts';
import { z } from 'zod';
import { BusinessService } from '../application/business.service';
import type { Actor } from '../domain/actor';
import { AdminSessionGuard } from './admin-session.guard';
import { CurrentActor } from './current-actor.decorator';

@Controller('admin/businesses')
@UseGuards(AdminSessionGuard)
export class BusinessController {
  constructor(private readonly businesses: BusinessService) {}

  @Post()
  create(
    @CurrentActor() actor: Actor,
    @Body({ schema: createBusinessRequestSchema })
    body: z.infer<typeof createBusinessRequestSchema>,
  ): Promise<CreatedBusiness> {
    return this.businesses.create(actor, body);
  }

  @Get()
  list(
    @CurrentActor() actor: Actor,
    @Query({ schema: pageQuerySchema }) page: z.infer<typeof pageQuerySchema>,
  ): Promise<Page<Business>> {
    return this.businesses.list(actor, page);
  }

  @Get(':businessId')
  get(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
  ): Promise<Business> {
    return this.businesses.get(actor, businessId);
  }

  @Patch(':businessId')
  update(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Body({ schema: updateBusinessRequestSchema })
    body: z.infer<typeof updateBusinessRequestSchema>,
  ): Promise<Business> {
    return this.businesses.update(actor, businessId, body);
  }
}
