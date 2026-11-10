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

/**
 * True for the public site itself or any of its subdomains (each business has one,
 * ADR-0029), with the same scheme and port. Anything else, "null" included, is not.
 */
export function isPublicSiteOrigin(
  site: URL,
  origin: string | undefined,
): boolean {
  if (origin === undefined) return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  return (
    parsed.origin === origin &&
    parsed.protocol === site.protocol &&
    parsed.port === site.port &&
    (parsed.hostname === site.hostname ||
      parsed.hostname.endsWith(`.${site.hostname}`))
  );
}

/**
 * CSRF protection for the diner's writes (ADR-0039), as AdminOriginGuard does for the
 * admin: a state-changing request must come from a page of the public site, whatever
 * restaurant subdomain it is on. Browsers always send Origin on such requests.
 */
@Injectable()
export class PublicSiteOriginGuard implements CanActivate {
  private readonly site: URL;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.site = new URL(config.publicSiteUrl);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      SAFE_METHODS.has(request.method) ||
      isPublicSiteOrigin(this.site, request.headers.origin)
    )
      return true;
    throw new ApiException(
      403,
      GENERIC_ERROR_CODES.ORIGIN_NOT_ALLOWED,
      'Origin not allowed',
    );
  }
}
