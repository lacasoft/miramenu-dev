import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Redirect,
} from '@nestjs/common';
import {
  qrCodeSchema,
  type Resolution,
  resolveQuerySchema,
} from '@miramenu/contracts';
import type { z } from 'zod';
import { notFound } from '../application/access-control';
import { ResolutionService } from '../application/resolution.service';

/** Public routes of the QR and the site (ADR-0010, ADR-0018, ADR-0029). */
@Controller()
export class PublicResolutionController {
  constructor(private readonly resolution: ResolutionService) {}

  /** 302 without browser cache, so the QR always follows the current subdomain (ADR-0018). */
  @Get('q/:code')
  @Header('Cache-Control', 'no-store')
  @Redirect()
  async qr(
    @Param('code') code: string,
  ): Promise<{ url: string; statusCode: number }> {
    // Any malformed code is simply unknown: 404, never a validation error to probe with.
    const resolved = qrCodeSchema.safeParse(code).success
      ? await this.resolution.resolveQr(code)
      : null;
    if (!resolved) throw notFound();
    return { url: resolved.canonicalUrl, statusCode: 302 };
  }

  /** For the PWA: which branch a subdomain (and slug) is, and its canonical URL. */
  @Get('resolve')
  async resolve(
    @Query({ schema: resolveQuerySchema })
    query: z.infer<typeof resolveQuerySchema>,
  ): Promise<Resolution> {
    const resolved = await this.resolution.resolveSite(
      query.subdomain,
      query.slug,
    );
    if (!resolved) throw notFound();
    return resolved;
  }
}
