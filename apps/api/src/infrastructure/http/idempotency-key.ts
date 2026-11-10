import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import {
  IDEMPOTENCY_KEY_HEADER,
  idempotencyKeySchema,
} from '@miramenu/contracts';
import type { Request } from 'express';
import { RequestValidationException } from './request-validation';

/** The Idempotency-Key header, validated (pipes do not run on headers, so it checks itself). */
export function readIdempotencyKey(request: Request): string {
  const parsed = idempotencyKeySchema.safeParse(
    request.header(IDEMPOTENCY_KEY_HEADER),
  );
  if (!parsed.success) {
    throw new RequestValidationException([IDEMPOTENCY_KEY_HEADER]);
  }
  return parsed.data;
}

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    readIdempotencyKey(context.switchToHttp().getRequest<Request>()),
);
