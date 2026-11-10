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
  type BusinessMenuDraft,
  type Category,
  createCategoryRequestSchema,
  createDishRequestSchema,
  type Dish,
  type Profile,
  putProfileRequestSchema,
  updateCategoryRequestSchema,
  updateDishRequestSchema,
} from '@miramenu/contracts';
import { z } from 'zod';
import {
  type Actor,
  AdminSessionGuard,
  CurrentActor,
} from '../../business-access';
import { BaseMenuService } from '../application/base-menu.service';

/** The business's base menu draft (design: "Editar el menú"). */
@Controller('admin/businesses/:businessId')
@UseGuards(AdminSessionGuard)
export class BaseMenuController {
  constructor(private readonly menu: BaseMenuService) {}

  @Get('menu-draft')
  draft(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
  ): Promise<BusinessMenuDraft> {
    return this.menu.draft(actor, businessId);
  }

  @Put('profile')
  putProfile(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Body({ schema: putProfileRequestSchema }) body: Profile,
  ): Promise<Profile> {
    return this.menu.putProfile(actor, businessId, body);
  }

  @Post('categories')
  createCategory(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Body({ schema: createCategoryRequestSchema })
    body: z.infer<typeof createCategoryRequestSchema>,
  ): Promise<Category> {
    return this.menu.createCategory(actor, businessId, body);
  }

  @Patch('categories/:categoryId')
  updateCategory(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Param('categoryId', { schema: z.uuid() }) categoryId: string,
    @Body({ schema: updateCategoryRequestSchema })
    body: z.infer<typeof updateCategoryRequestSchema>,
  ): Promise<Category> {
    return this.menu.updateCategory(actor, businessId, categoryId, body);
  }

  @Delete('categories/:categoryId')
  @HttpCode(204)
  removeCategory(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Param('categoryId', { schema: z.uuid() }) categoryId: string,
  ): Promise<void> {
    return this.menu.removeCategory(actor, businessId, categoryId);
  }

  @Post('dishes')
  createDish(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Body({ schema: createDishRequestSchema })
    body: z.infer<typeof createDishRequestSchema>,
  ): Promise<Dish> {
    return this.menu.createDish(actor, businessId, body);
  }

  @Patch('dishes/:dishId')
  updateDish(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Param('dishId', { schema: z.uuid() }) dishId: string,
    @Body({ schema: updateDishRequestSchema })
    body: z.infer<typeof updateDishRequestSchema>,
  ): Promise<Dish> {
    return this.menu.updateDish(actor, businessId, dishId, body);
  }

  @Delete('dishes/:dishId')
  @HttpCode(204)
  removeDish(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Param('dishId', { schema: z.uuid() }) dishId: string,
  ): Promise<void> {
    return this.menu.removeDish(actor, businessId, dishId);
  }
}
