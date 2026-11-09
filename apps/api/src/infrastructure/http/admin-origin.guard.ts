import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { GENERIC_ERROR_CODES } from '@miramenu/contracts';
import type { Request } from 'express';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/environment';
import { ApiException } from './api-exception';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ADMIN_PREFIX = '/admin/';

/**
 * CSRF protection for the admin (ADR-0035): every request under /admin that changes state,
 * login included, must come from the admin app's origin. Browsers always send Origin on
 * such requests, and a page on another site cannot forge it. Works with SameSite=Strict.
 */
@Injectable()
export class AdminOriginGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (
      SAFE_METHODS.has(request.method) ||
      !request.path.startsWith(ADMIN_PREFIX)
    )
      return true;
    if (request.headers.origin === this.config.adminAppUrl) return true;
    throw new ApiException(
      403,
      GENERIC_ERROR_CODES.ORIGIN_NOT_ALLOWED,
      'Origin not allowed',
    );
  }
}
