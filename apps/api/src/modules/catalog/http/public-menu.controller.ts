import { Controller, Get, Param, Res } from '@nestjs/common';
import type { PublishedMenu } from '@miramenu/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import { PublishedMenuService } from '../application/published-menu.service';

/**
 * The menu diners read (design: "Ver el menú"). Each version is fixed, so its ETag is the
 * version: a client that has it gets 304, and every client revalidates, so a new
 * publication is seen at once.
 */
@Controller('branches')
export class PublicMenuController {
  constructor(private readonly menus: PublishedMenuService) {}

  @Get(':branchId/menu')
  async menu(
    @Param('branchId', { schema: z.uuid() }) branchId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublishedMenu> {
    const menu = await this.menus.latest(branchId);
    response.setHeader('ETag', `"menu-v${menu.version}"`);
    response.setHeader('Cache-Control', 'public, no-cache');
    return menu;
  }
}
