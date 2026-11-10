import {
  Body,
  Controller,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type CodeRequested,
  type DinerSession,
  requestCodeSchema,
  verifyCodeSchema,
} from '@miramenu/contracts';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { PublicSiteOriginGuard } from '../../../infrastructure/http/public-site-origin.guard';
import { RegistrationService } from '../application/registration.service';
import { DeviceId } from './device-id.decorator';
import {
  DINER_SESSION_COOKIE,
  dinerCookieOptions,
} from './diner-identity.guard';

/** Registration with a code; only pages of the public site may call it (ADR-0039). */
@Controller('registration')
@UseGuards(PublicSiteOriginGuard)
export class RegistrationController {
  constructor(private readonly registration: RegistrationService) {}

  @Post('code')
  @HttpCode(202)
  requestCode(
    @Body({ schema: requestCodeSchema })
    body: z.infer<typeof requestCodeSchema>,
    @DeviceId() deviceId: string,
    @Req() request: Request,
  ): Promise<CodeRequested> {
    return this.registration.requestCode({
      phone: body.phone,
      deviceId,
      ip: request.ip ?? 'unknown',
      now: new Date(),
    });
  }

  @Post('verify')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async verify(
    @Body({ schema: verifyCodeSchema })
    body: z.output<typeof verifyCodeSchema>,
    @DeviceId() deviceId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DinerSession> {
    const registered = await this.registration.verify(
      body,
      deviceId,
      new Date(),
    );
    response.cookie(
      DINER_SESSION_COOKIE,
      registered.session.token,
      dinerCookieOptions(registered.session.expiresAt),
    );
    return { diner: registered.diner };
  }
}
