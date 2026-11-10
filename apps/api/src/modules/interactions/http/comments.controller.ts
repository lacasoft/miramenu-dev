import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  createCommentSchema,
  editCommentSchema,
  type OwnComment,
  type Page,
  pageQuerySchema,
  type PublicComment,
} from '@miramenu/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import { PublicSiteOriginGuard } from '../../../infrastructure/http/public-site-origin.guard';
import { RegisteredDiner, RegisteredDinerGuard } from '../../diners';
import { CommentsService } from '../application/comments.service';

type Diner = { id: string; name: string };

/** Comments: the public list of a dish, and a registered diner's own comments. */
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('branches/:branchId/dishes/:dishId/comments')
  @Header('Cache-Control', 'public, max-age=10')
  approved(
    @Param('branchId', { schema: z.uuid() }) branchId: string,
    @Param('dishId', { schema: z.uuid() }) dishId: string,
    @Query({ schema: pageQuerySchema })
    query: z.infer<typeof pageQuerySchema>,
  ): Promise<Page<PublicComment>> {
    return this.comments.approved(branchId, dishId, query);
  }

  /** 201 for a new comment; 200 when the client retried one it had already posted. */
  @Post('comments')
  @UseGuards(PublicSiteOriginGuard, RegisteredDinerGuard)
  @Header('Cache-Control', 'no-store')
  async create(
    @RegisteredDiner() diner: Diner,
    @Body({ schema: createCommentSchema })
    body: z.output<typeof createCommentSchema>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OwnComment> {
    const { comment, created } = await this.comments.create(
      diner.id,
      body,
      new Date(),
    );
    response.status(created ? 201 : 200);
    return comment;
  }

  @Get('comments/mine')
  @UseGuards(RegisteredDinerGuard)
  @Header('Cache-Control', 'no-store')
  mine(
    @RegisteredDiner() diner: Diner,
    @Query({ schema: pageQuerySchema })
    query: z.infer<typeof pageQuerySchema>,
  ): Promise<Page<OwnComment>> {
    return this.comments.mine(diner.id, query);
  }

  @Patch('comments/:commentId')
  @UseGuards(PublicSiteOriginGuard, RegisteredDinerGuard)
  @Header('Cache-Control', 'no-store')
  edit(
    @RegisteredDiner() diner: Diner,
    @Param('commentId', { schema: z.uuid() }) commentId: string,
    @Body({ schema: editCommentSchema })
    body: z.output<typeof editCommentSchema>,
  ): Promise<OwnComment> {
    return this.comments.edit(diner.id, commentId, body.text, new Date());
  }

  @Delete('comments/:commentId')
  @HttpCode(204)
  @UseGuards(PublicSiteOriginGuard, RegisteredDinerGuard)
  remove(
    @RegisteredDiner() diner: Diner,
    @Param('commentId', { schema: z.uuid() }) commentId: string,
  ): Promise<void> {
    return this.comments.remove(diner.id, commentId, new Date());
  }
}
