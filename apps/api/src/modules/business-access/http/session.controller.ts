import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { loginRequestSchema, type SessionActor } from '@miramenu/contracts';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { AdminSessionService } from '../application/admin-session.service';
import { LoginService } from '../application/login.service';
import type { Actor } from '../domain/actor';
import {
  ADMIN_SESSION_COOKIE,
  type AdminRequest,
  AdminSessionGuard,
  sessionCookieOptions,
} from './admin-session.guard';
import { CurrentActor } from './current-actor.decorator';

@Controller('admin/session')
export class SessionController {
  constructor(
    private readonly login: LoginService,
    private readonly sessions: AdminSessionService,
  ) {}

  @Post()
  @HttpCode(204)
  async open(
    @Body({ schema: loginRequestSchema })
    credentials: z.infer<typeof loginRequestSchema>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const session = await this.login.login(
      credentials,
      request.ip ?? 'unknown',
    );
    response.cookie(
      ADMIN_SESSION_COOKIE,
      session.token,
      sessionCookieOptions(session.expiresAt),
    );
  }

  @Get()
  @UseGuards(AdminSessionGuard)
  current(@CurrentActor() actor: Actor): SessionActor {
    return {
      user: { id: actor.userId, email: actor.email, name: actor.name },
      isSuperadmin: actor.isSuperadmin,
      roles: actor.roles.map((role) => ({ ...role })),
    };
  }

  @Delete()
  @HttpCode(204)
  @UseGuards(AdminSessionGuard)
  async close(
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    if (request.adminSessionToken)
      await this.sessions.revoke(request.adminSessionToken, new Date());
    response.clearCookie(ADMIN_SESSION_COOKIE, sessionCookieOptions());
  }
}
