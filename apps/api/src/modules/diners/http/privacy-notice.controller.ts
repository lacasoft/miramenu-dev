import { Controller, Get, Header, Inject } from '@nestjs/common';
import type { PrivacyNotice } from '@miramenu/contracts';
import { APP_CONFIG } from '../../../infrastructure/config/config.module';
import type { AppConfig } from '../../../infrastructure/config/environment';

/**
 * The privacy notice in force: the PWA links to it from the registration form and sends
 * back its version, which registration checks (ADR-0039). One source of truth, so the
 * PWA never offers a notice the API would refuse.
 */
@Controller('privacy-notice')
export class PrivacyNoticeController {
  private readonly notice: PrivacyNotice;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.notice = {
      version: config.dinerRegistration.privacyNoticeVersion,
      url: config.dinerRegistration.privacyNoticeUrl,
    };
  }

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  current(): PrivacyNotice {
    return this.notice;
  }
}
