import { Controller, HttpCode, Post, Req } from '@nestjs/common';
import { GENERIC_ERROR_CODES } from '@miramenu/contracts';
import type { Request } from 'express';
import { ApiException } from '../../../infrastructure/http/api-exception';
import { SendTracking } from '../application/send-tracking';

/**
 * Delivery reports of the provider of codes (ADR-0039). There is no session or Origin:
 * the provider's signature is what authenticates each report.
 */
@Controller('webhooks/verification')
export class DeliveryReportController {
  constructor(private readonly sends: SendTracking) {}

  @Post('status')
  @HttpCode(204)
  async report(@Req() request: Request): Promise<void> {
    const queryStart = request.originalUrl.indexOf('?');
    const accepted = await this.sends.recordReport({
      query: queryStart === -1 ? '' : request.originalUrl.slice(queryStart),
      body: request.body,
      headers: request.headers,
    });
    if (!accepted) {
      throw new ApiException(
        403,
        GENERIC_ERROR_CODES.FORBIDDEN,
        'Invalid signature',
      );
    }
  }
}
