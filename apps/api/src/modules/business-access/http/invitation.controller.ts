import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { acceptInvitationRequestSchema } from '@miramenu/contracts';
import type { z } from 'zod';
import { InvitationService } from '../application/invitation.service';

/** The token travels in the body, never in the URL (ADR-0033). No session: the admin has no password yet. */
@Controller('admin/invitations')
export class InvitationController {
  constructor(private readonly invitations: InvitationService) {}

  @Post('accept')
  @HttpCode(204)
  async accept(
    @Body({ schema: acceptInvitationRequestSchema })
    body: z.infer<typeof acceptInvitationRequestSchema>,
  ): Promise<void> {
    await this.invitations.accept(body.token, body.password);
  }
}
