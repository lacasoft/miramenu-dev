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
  type Branch,
  createBranchRequestSchema,
  type Page,
  pageQuerySchema,
  type QrLink,
  updateBranchRequestSchema,
} from '@miramenu/contracts';
import { z } from 'zod';
import { BranchService } from '../application/branch.service';
import type { Actor } from '../domain/actor';
import { AdminSessionGuard } from './admin-session.guard';
import { CurrentActor } from './current-actor.decorator';

@Controller('admin')
@UseGuards(AdminSessionGuard)
export class BranchController {
  constructor(private readonly branches: BranchService) {}

  @Post('businesses/:businessId/branches')
  create(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Body({ schema: createBranchRequestSchema })
    body: z.infer<typeof createBranchRequestSchema>,
  ): Promise<Branch> {
    return this.branches.create(actor, businessId, body);
  }

  @Get('businesses/:businessId/branches')
  list(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Query({ schema: pageQuerySchema }) page: z.infer<typeof pageQuerySchema>,
  ): Promise<Page<Branch>> {
    return this.branches.list(actor, businessId, page);
  }

  @Get('branches/:branchId')
  get(
    @CurrentActor() actor: Actor,
    @Param('branchId', { schema: z.uuid() }) branchId: string,
  ): Promise<Branch> {
    return this.branches.get(actor, branchId);
  }

  @Patch('branches/:branchId')
  update(
    @CurrentActor() actor: Actor,
    @Param('branchId', { schema: z.uuid() }) branchId: string,
    @Body({ schema: updateBranchRequestSchema })
    body: z.infer<typeof updateBranchRequestSchema>,
  ): Promise<Branch> {
    return this.branches.update(actor, branchId, body);
  }

  @Get('branches/:branchId/qr')
  qr(
    @CurrentActor() actor: Actor,
    @Param('branchId', { schema: z.uuid() }) branchId: string,
  ): Promise<QrLink> {
    return this.branches.qr(actor, branchId);
  }
}
