import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  type BranchDish,
  type BranchMenuDraft,
  createBranchDishRequestSchema,
  type Override,
  type Profile,
  putProfileRequestSchema,
  putOverrideRequestSchema,
  updateBranchDishRequestSchema,
} from '@miramenu/contracts';
import { z } from 'zod';
import {
  type Actor,
  AdminSessionGuard,
  CurrentActor,
} from '../../business-access';
import { BranchMenuService } from '../application/branch-menu.service';

/** A branch's draft: adjustments, own dishes and own profile (design: "Editar el menú"). */
@Controller('admin/branches/:branchId')
@UseGuards(AdminSessionGuard)
export class BranchMenuController {
  constructor(private readonly menu: BranchMenuService) {}

  @Get('menu-draft')
  draft(
    @CurrentActor() actor: Actor,
    @Param('branchId', { schema: z.uuid() }) branchId: string,
  ): Promise<BranchMenuDraft> {
    return this.menu.draft(actor, branchId);
  }

  @Put('overrides/:dishId')
  putOverride(
    @CurrentActor() actor: Actor,
    @Param('branchId', { schema: z.uuid() }) branchId: string,
    @Param('dishId', { schema: z.uuid() }) dishId: string,
    @Body({ schema: putOverrideRequestSchema })
    body: z.infer<typeof putOverrideRequestSchema>,
  ): Promise<Override> {
    return this.menu.putOverride(actor, branchId, dishId, body);
  }

  @Delete('overrides/:dishId')
  @HttpCode(204)
  deleteOverride(
    @CurrentActor() actor: Actor,
    @Param('branchId', { schema: z.uuid() }) branchId: string,
    @Param('dishId', { schema: z.uuid() }) dishId: string,
  ): Promise<void> {
    return this.menu.deleteOverride(actor, branchId, dishId);
  }

  @Post('dishes')
  createDish(
    @CurrentActor() actor: Actor,
    @Param('branchId', { schema: z.uuid() }) branchId: string,
    @Body({ schema: createBranchDishRequestSchema })
    body: z.infer<typeof createBranchDishRequestSchema>,
  ): Promise<BranchDish> {
    return this.menu.createDish(actor, branchId, body);
  }

  @Patch('dishes/:dishId')
  updateDish(
    @CurrentActor() actor: Actor,
    @Param('branchId', { schema: z.uuid() }) branchId: string,
    @Param('dishId', { schema: z.uuid() }) dishId: string,
    @Body({ schema: updateBranchDishRequestSchema })
    body: z.infer<typeof updateBranchDishRequestSchema>,
  ): Promise<BranchDish> {
    return this.menu.updateDish(actor, branchId, dishId, body);
  }

  @Delete('dishes/:dishId')
  @HttpCode(204)
  deleteDish(
    @CurrentActor() actor: Actor,
    @Param('branchId', { schema: z.uuid() }) branchId: string,
    @Param('dishId', { schema: z.uuid() }) dishId: string,
  ): Promise<void> {
    return this.menu.deleteDish(actor, branchId, dishId);
  }

  @Put('profile')
  putProfile(
    @CurrentActor() actor: Actor,
    @Param('branchId', { schema: z.uuid() }) branchId: string,
    @Body({ schema: putProfileRequestSchema }) body: Profile,
  ): Promise<Profile> {
    return this.menu.putProfile(actor, branchId, body);
  }

  /** Back to the business's profile. */
  @Delete('profile')
  @HttpCode(204)
  deleteProfile(
    @CurrentActor() actor: Actor,
    @Param('branchId', { schema: z.uuid() }) branchId: string,
  ): Promise<void> {
    return this.menu.deleteProfile(actor, branchId);
  }
}
