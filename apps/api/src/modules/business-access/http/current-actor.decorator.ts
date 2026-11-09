import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Actor } from '../domain/actor';
import type { AdminRequest } from './admin-session.guard';

/** The actor the AdminSessionGuard resolved; using it without the guard is a programming error. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor => {
    const actor = context.switchToHttp().getRequest<AdminRequest>().adminActor;
    if (!actor)
      throw new Error('CurrentActor used on a route without AdminSessionGuard');
    return actor;
  },
);
