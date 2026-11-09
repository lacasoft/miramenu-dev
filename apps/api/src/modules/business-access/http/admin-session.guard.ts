import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { GENERIC_ERROR_CODES, secretTokenSchema } from '@miramenu/contracts';
import type { CookieOptions, Request } from 'express';
import { ApiException } from '../../../infrastructure/http/api-exception';
import { readCookie } from '../../../infrastructure/http/cookies';
import { AdminSessionService } from '../application/admin-session.service';
import type { Actor } from '../domain/actor';

/** __Host-: only sent over HTTPS, to this exact host, with Path=/ (ADR-0035). */
export const ADMIN_SESSION_COOKIE = '__Host-miramenu_admin';

export function sessionCookieOptions(expiresAt?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

export interface AdminRequest extends Request {
  adminActor?: Actor;
  adminSessionToken?: string;
}

/**
 * Resolves the actor of every admin route from its session cookie (ADR-0028). Roles are
 * read again on every request, so removing a role takes effect at once.
 */
@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private readonly sessions: AdminSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const token = readCookie(request.headers.cookie, ADMIN_SESSION_COOKIE);
    const actor =
      token !== undefined && secretTokenSchema.safeParse(token).success
        ? await this.sessions.authenticate(token, new Date())
        : null;
    if (!actor || token === undefined) {
      throw new ApiException(
        401,
        GENERIC_ERROR_CODES.UNAUTHENTICATED,
        'Sign in required',
      );
    }
    request.adminActor = actor;
    request.adminSessionToken = token;
    return true;
  }
}
