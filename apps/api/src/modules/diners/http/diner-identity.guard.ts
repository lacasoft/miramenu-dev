import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { DEVICE_ID_HEADER } from '@miramenu/contracts';
import type { CookieOptions, Request } from 'express';
import { readCookie } from '../../../infrastructure/http/cookies';
import {
  DinerIdentity,
  type IdentifiedDiner,
} from '../application/diner-identity';
import { signInRequired } from '../application/errors';

/** __Host-: only over HTTPS, to the API's exact host, with Path=/ (ADR-0039). */
export const DINER_SESSION_COOKIE = '__Host-miramenu_diner';

export function dinerCookieOptions(expiresAt?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

export interface DinerRequest extends Request {
  dinerIdentity?: IdentifiedDiner;
  dinerSessionToken?: string;
}

async function attachIdentity(
  identity: DinerIdentity,
  context: ExecutionContext,
): Promise<DinerRequest> {
  const request = context.switchToHttp().getRequest<DinerRequest>();
  const token = readCookie(request.headers.cookie, DINER_SESSION_COOKIE);
  const device = request.headers[DEVICE_ID_HEADER];
  request.dinerIdentity = await identity.identify(
    token,
    typeof device === 'string' ? device : undefined,
    new Date(),
  );
  if (request.dinerIdentity.diner !== null) request.dinerSessionToken = token;
  return request;
}

/** Any diner, anonymous or registered: for likes and the PWA's own requests. */
@Injectable()
export class DinerIdentityGuard implements CanActivate {
  constructor(private readonly identity: DinerIdentity) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await attachIdentity(this.identity, context);
    return true;
  }
}

/** Only a registered diner (design: "comentar exige registro"); 401 otherwise. */
@Injectable()
export class RegisteredDinerGuard implements CanActivate {
  constructor(private readonly identity: DinerIdentity) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = await attachIdentity(this.identity, context);
    if (!request.dinerIdentity?.diner) throw signInRequired();
    return true;
  }
}

/** The diner either guard identified; using it without one is a programming error. */
export const CurrentDiner = createParamDecorator(
  (_data: unknown, context: ExecutionContext): IdentifiedDiner => {
    const identity = context
      .switchToHttp()
      .getRequest<DinerRequest>().dinerIdentity;
    if (!identity)
      throw new Error('CurrentDiner used on a route without a diner guard');
    return identity;
  },
);

/** The diner RegisteredDinerGuard let through; on any other route it is a programming error. */
export const RegisteredDiner = createParamDecorator(
  (_data: unknown, context: ExecutionContext): { id: string; name: string } => {
    const diner = context.switchToHttp().getRequest<DinerRequest>()
      .dinerIdentity?.diner;
    if (!diner)
      throw new Error(
        'RegisteredDiner used on a route without RegisteredDinerGuard',
      );
    return diner;
  },
);
