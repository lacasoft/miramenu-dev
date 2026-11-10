import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { DinerSession } from '@miramenu/contracts';
import type { Response } from 'express';
import { PublicSiteOriginGuard } from '../../../infrastructure/http/public-site-origin.guard';
import { DinerSessions } from '../application/diner-sessions';
import {
  DINER_SESSION_COOKIE,
  dinerCookieOptions,
  type DinerRequest,
  RegisteredDiner,
  RegisteredDinerGuard,
} from './diner-identity.guard';

/** The registered diner's own session: who am I, and sign out. */
@Controller('diner/session')
@UseGuards(PublicSiteOriginGuard, RegisteredDinerGuard)
export class DinerSessionController {
  constructor(private readonly sessions: DinerSessions) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  current(
    @RegisteredDiner() diner: { id: string; name: string },
  ): DinerSession {
    return { diner };
  }

  @Delete()
  @HttpCode(204)
  async close(
    @Req() request: DinerRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    if (request.dinerSessionToken)
      await this.sessions.revoke(request.dinerSessionToken, new Date());
    response.clearCookie(DINER_SESSION_COOKIE, dinerCookieOptions());
  }
}
