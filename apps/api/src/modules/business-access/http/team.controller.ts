import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type BusinessUser,
  type InvitedUser,
  inviteUserRequestSchema,
  type Page,
  pageQuerySchema,
  setRolesRequestSchema,
} from '@miramenu/contracts';
import { z } from 'zod';
import { TeamService } from '../application/team.service';
import type { Actor } from '../domain/actor';
import { AdminSessionGuard } from './admin-session.guard';
import { CurrentActor } from './current-actor.decorator';

@Controller('admin/businesses/:businessId/users')
@UseGuards(AdminSessionGuard)
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  list(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Query({ schema: pageQuerySchema }) page: z.infer<typeof pageQuerySchema>,
  ): Promise<Page<BusinessUser>> {
    return this.team.list(actor, businessId, page);
  }

  @Post()
  invite(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Body({ schema: inviteUserRequestSchema })
    body: z.infer<typeof inviteUserRequestSchema>,
  ): Promise<InvitedUser> {
    return this.team.invite(actor, businessId, body);
  }

  @Put(':userId/roles')
  setRoles(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Param('userId', { schema: z.uuid() }) userId: string,
    @Body({ schema: setRolesRequestSchema })
    body: z.infer<typeof setRolesRequestSchema>,
  ): Promise<BusinessUser> {
    return this.team.setRoles(actor, businessId, userId, body.roles);
  }

  @Delete(':userId/roles')
  @HttpCode(204)
  removeRoles(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Param('userId', { schema: z.uuid() }) userId: string,
  ): Promise<void> {
    return this.team.removeRoles(actor, businessId, userId);
  }

  @Post(':userId/invitation')
  @HttpCode(200)
  resendInvitation(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Param('userId', { schema: z.uuid() }) userId: string,
  ): Promise<{ sent: boolean }> {
    return this.team.resendInvitation(actor, businessId, userId);
  }
}
